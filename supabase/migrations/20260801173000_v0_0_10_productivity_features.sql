-- v0.0.10 productivity features: searchable/pinnable inbox, saved filters,
-- owner schedules, source health, and quiet-hour-aware push delivery.

alter table public.notifications
  add column if not exists pinned_at timestamptz,
  add column if not exists push_suppressed_reason text
    check (push_suppressed_reason is null or push_suppressed_reason in ('quiet_hours'));

create index if not exists notifications_account_pinned_created_idx
  on public.notifications (account_id, pinned_at desc, created_at desc, id desc)
  where pinned_at is not null;

create or replace view public.inbox_notifications
with (security_invoker = true)
as
select
  notification.id,
  notification.user_id,
  notification.source_id,
  notification.source_name_snapshot,
  notification.title,
  notification.body,
  notification.category,
  notification.data,
  notification.created_at,
  notification.read_at,
  notification.expires_at,
  notification.idempotency_key,
  notification.request_hash,
  notification.attachment_path,
  notification.attachment_mime,
  notification.attachment_bytes,
  notification.severity,
  notification.pinned_at,
  notification.push_suppressed_reason
from public.notifications as notification;

revoke all on public.inbox_notifications from anon, authenticated;
grant select on public.inbox_notifications to authenticated;
grant all on public.inbox_notifications to service_role;

create table private.saved_inbox_filters (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references private.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(pg_catalog.btrim(name)) between 1 and 40),
  search_query text not null default '' check (char_length(search_query) <= 100),
  source_id uuid references public.sources(id) on delete set null,
  unread_only boolean not null default false,
  pinned_only boolean not null default false,
  severity text check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  since_hours integer check (since_hours is null or since_hours between 1 and 720),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index saved_inbox_filters_account_name_idx
  on private.saved_inbox_filters (account_id, pg_catalog.lower(name));
create index saved_inbox_filters_account_order_idx
  on private.saved_inbox_filters (account_id, created_at, id);

create table private.notification_schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references private.accounts(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null default 'Asia/Hong_Kong'
    check (char_length(timezone) between 1 and 80),
  weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  start_minute integer not null default 1320 check (start_minute between 0 and 1439),
  end_minute integer not null default 480 check (end_minute between 0 and 1439),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (cardinality(weekdays) between 1 and 7),
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create unique index notification_schedules_account_global_idx
  on private.notification_schedules (account_id) where source_id is null;
create unique index notification_schedules_source_idx
  on private.notification_schedules (source_id) where source_id is not null;
create index notification_schedules_account_idx
  on private.notification_schedules (account_id, enabled);

revoke all on private.saved_inbox_filters, private.notification_schedules
from public, anon, authenticated;
grant select, insert, update, delete on private.saved_inbox_filters,
  private.notification_schedules to service_role;

create or replace function public.get_inbox_page_v2(
  p_source_id uuid default null,
  p_since timestamptz default null,
  p_unread_only boolean default false,
  p_pinned_only boolean default false,
  p_severity text default null,
  p_search text default null,
  p_cursor_pinned boolean default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_page_size integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_search text := pg_catalog.btrim(coalesce(p_search, ''));
  v_search_pattern text;
  v_rows jsonb;
  v_unread_count integer;
  v_page_size integer := least(greatest(coalesce(p_page_size, 30), 1), 100);
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  if p_severity is not null and p_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'INVALID_FILTER';
  end if;
  if char_length(v_search) > 100 then raise exception 'INVALID_FILTER'; end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_cursor_created_at is not null and p_cursor_pinned is null) then
    raise exception 'INVALID_CURSOR';
  end if;

  v_search_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with requested as (
    select
      notification.id,
      notification.user_id,
      notification.source_id,
      notification.source_name_snapshot,
      notification.title,
      notification.body,
      notification.category,
      notification.severity,
      notification.data,
      notification.created_at,
      notification.read_at,
      notification.expires_at,
      notification.attachment_path,
      notification.attachment_mime,
      notification.attachment_bytes,
      notification.pinned_at,
      notification.push_suppressed_reason
    from public.notifications as notification
    where notification.user_id = v_user_id
      and notification.expires_at > pg_catalog.now()
      and (p_source_id is null or notification.source_id = p_source_id)
      and (not coalesce(p_unread_only, false) or notification.read_at is null)
      and (not coalesce(p_pinned_only, false) or notification.pinned_at is not null)
      and (p_since is null or notification.created_at >= p_since)
      and (p_severity is null or notification.severity = p_severity)
      and (
        v_search = ''
        or notification.title ilike v_search_pattern escape E'\\'
        or notification.body ilike v_search_pattern escape E'\\'
        or coalesce(notification.category, '') ilike v_search_pattern escape E'\\'
        or coalesce(notification.severity, '') ilike v_search_pattern escape E'\\'
        or notification.source_name_snapshot ilike v_search_pattern escape E'\\'
      )
      and (
        p_cursor_created_at is null
        or ((notification.pinned_at is not null)::integer < p_cursor_pinned::integer)
        or (
          (notification.pinned_at is not null) = p_cursor_pinned
          and (
            notification.created_at < p_cursor_created_at
            or (notification.created_at = p_cursor_created_at and notification.id < p_cursor_id)
          )
        )
      )
    order by (notification.pinned_at is not null) desc,
      notification.created_at desc, notification.id desc
    limit v_page_size + 1
  )
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(requested_row)
      order by (requested_row.pinned_at is not null) desc,
        requested_row.created_at desc, requested_row.id desc),
    '[]'::jsonb
  ) into v_rows
  from requested as requested_row;

  select count(*)::integer into v_unread_count
  from public.notifications as notification
  where notification.user_id = v_user_id
    and notification.expires_at > pg_catalog.now()
    and notification.read_at is null;

  return pg_catalog.jsonb_build_object(
    'rows', v_rows,
    'unreadCount', v_unread_count,
    'hasMore', pg_catalog.jsonb_array_length(v_rows) > v_page_size
  );
end;
$$;

create or replace function public.set_inbox_notification_pin(
  p_notification_id uuid,
  p_pinned boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  update public.notifications as notification
  set pinned_at = case when coalesce(p_pinned, false) then pg_catalog.now() else null end
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid())
    and notification.expires_at > pg_catalog.now();
  return found;
end;
$$;

create or replace function public.list_saved_inbox_filters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  select owner.account_id into v_account_id
  from private.personal_account_owners as owner
  where owner.user_id = (select auth.uid());

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', saved.id,
      'name', saved.name,
      'searchQuery', saved.search_query,
      'sourceId', saved.source_id,
      'unreadOnly', saved.unread_only,
      'pinnedOnly', saved.pinned_only,
      'severity', saved.severity,
      'sinceHours', saved.since_hours,
      'createdAt', saved.created_at,
      'updatedAt', saved.updated_at
    ) order by saved.created_at, saved.id)
    from private.saved_inbox_filters as saved
    where saved.account_id = v_account_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_inbox_filter(
  p_filter_id uuid,
  p_name text,
  p_search text default '',
  p_source_id uuid default null,
  p_unread_only boolean default false,
  p_pinned_only boolean default false,
  p_severity text default null,
  p_since_hours integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account_id uuid;
  v_row private.saved_inbox_filters%rowtype;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  if char_length(pg_catalog.btrim(coalesce(p_name, ''))) not between 1 and 40
    or char_length(pg_catalog.btrim(coalesce(p_search, ''))) > 100
    or (p_severity is not null and p_severity not in ('low', 'medium', 'high', 'critical'))
    or (p_since_hours is not null and p_since_hours not between 1 and 720) then
    raise exception 'INVALID_FILTER';
  end if;

  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = v_user_id;
  if p_source_id is not null and not exists (
    select 1 from public.sources as source
    where source.id = p_source_id and source.account_id = v_account_id
  ) then raise exception 'SOURCE_NOT_FOUND'; end if;

  if p_filter_id is null then
    insert into private.saved_inbox_filters (
      account_id, user_id, name, search_query, source_id,
      unread_only, pinned_only, severity, since_hours
    ) values (
      v_account_id, v_user_id, pg_catalog.btrim(p_name), pg_catalog.btrim(coalesce(p_search, '')),
      p_source_id, coalesce(p_unread_only, false), coalesce(p_pinned_only, false),
      p_severity, p_since_hours
    ) returning * into v_row;
  else
    update private.saved_inbox_filters as saved set
      name = pg_catalog.btrim(p_name),
      search_query = pg_catalog.btrim(coalesce(p_search, '')),
      source_id = p_source_id,
      unread_only = coalesce(p_unread_only, false),
      pinned_only = coalesce(p_pinned_only, false),
      severity = p_severity,
      since_hours = p_since_hours,
      updated_at = pg_catalog.now()
    where saved.id = p_filter_id and saved.account_id = v_account_id
    returning * into v_row;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'searchQuery', v_row.search_query,
    'sourceId', v_row.source_id,
    'unreadOnly', v_row.unread_only,
    'pinnedOnly', v_row.pinned_only,
    'severity', v_row.severity,
    'sinceHours', v_row.since_hours,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.delete_saved_inbox_filter(p_filter_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = (select auth.uid());
  delete from private.saved_inbox_filters as saved
  where saved.id = p_filter_id and saved.account_id = v_account_id;
  return found;
end;
$$;

create or replace function public.get_notification_schedule(p_source_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_row private.notification_schedules%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = (select auth.uid());
  if p_source_id is not null and not exists (
    select 1 from public.sources as source
    where source.id = p_source_id and source.account_id = v_account_id
  ) then raise exception 'SOURCE_NOT_FOUND'; end if;

  select schedule.* into v_row
  from private.notification_schedules as schedule
  where schedule.account_id = v_account_id
    and schedule.source_id is not distinct from p_source_id;

  return pg_catalog.jsonb_build_object(
    'sourceId', p_source_id,
    'enabled', coalesce(v_row.enabled, false),
    'timezone', coalesce(v_row.timezone, 'Asia/Hong_Kong'),
    'weekdays', coalesce(v_row.weekdays, array[0,1,2,3,4,5,6]::smallint[]),
    'startMinute', coalesce(v_row.start_minute, 1320),
    'endMinute', coalesce(v_row.end_minute, 480),
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.set_notification_schedule(
  p_source_id uuid,
  p_enabled boolean,
  p_timezone text,
  p_weekdays smallint[],
  p_start_minute integer,
  p_end_minute integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_row private.notification_schedules%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) or p_weekdays is null or cardinality(p_weekdays) not between 1 and 7
    or not (p_weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
    or (select count(distinct day) from unnest(p_weekdays) as day) <> cardinality(p_weekdays)
    or p_start_minute not between 0 and 1439 or p_end_minute not between 0 and 1439 then
    raise exception 'INVALID_SCHEDULE';
  end if;

  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = (select auth.uid());
  if p_source_id is not null and not exists (
    select 1 from public.sources as source
    where source.id = p_source_id and source.account_id = v_account_id
  ) then raise exception 'SOURCE_NOT_FOUND'; end if;

  select schedule.* into v_row from private.notification_schedules as schedule
  where schedule.account_id = v_account_id
    and schedule.source_id is not distinct from p_source_id
  for update;

  if found then
    update private.notification_schedules as schedule set
      enabled = coalesce(p_enabled, false),
      timezone = p_timezone,
      weekdays = p_weekdays,
      start_minute = p_start_minute,
      end_minute = p_end_minute,
      updated_at = pg_catalog.now()
    where schedule.id = v_row.id returning * into v_row;
  else
    insert into private.notification_schedules (
      account_id, source_id, enabled, timezone, weekdays, start_minute, end_minute
    ) values (
      v_account_id, p_source_id, coalesce(p_enabled, false), p_timezone,
      p_weekdays, p_start_minute, p_end_minute
    ) returning * into v_row;
  end if;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_row.source_id,
    'enabled', v_row.enabled,
    'timezone', v_row.timezone,
    'weekdays', v_row.weekdays,
    'startMinute', v_row.start_minute,
    'endMinute', v_row.end_minute,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function private.notification_push_is_quiet(
  p_account_id uuid,
  p_source_id uuid,
  p_at timestamptz default pg_catalog.now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.notification_schedules as schedule
    cross join lateral (
      select pg_catalog.timezone(schedule.timezone, p_at) as local_at
    ) as clock
    cross join lateral (
      select
        extract(dow from clock.local_at)::integer as weekday,
        (extract(hour from clock.local_at)::integer * 60
          + extract(minute from clock.local_at)::integer) as minute_of_day
    ) as local_time
    where schedule.account_id = p_account_id
      and schedule.enabled
      and (schedule.source_id is null or schedule.source_id = p_source_id)
      and (
        (schedule.start_minute = schedule.end_minute
          and local_time.weekday = any(schedule.weekdays))
        or (schedule.start_minute < schedule.end_minute
          and local_time.weekday = any(schedule.weekdays)
          and local_time.minute_of_day >= schedule.start_minute
          and local_time.minute_of_day < schedule.end_minute)
        or (schedule.start_minute > schedule.end_minute and (
          (local_time.weekday = any(schedule.weekdays)
            and local_time.minute_of_day >= schedule.start_minute)
          or (mod(local_time.weekday + 6, 7) = any(schedule.weekdays)
            and local_time.minute_of_day < schedule.end_minute)
        ))
      )
  );
$$;

revoke all on function private.notification_push_is_quiet(uuid, uuid, timestamptz)
from public, anon, authenticated;

create or replace function private.enqueue_notification_push_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_push_enabled boolean;
  v_play_sound boolean;
  v_show_preview boolean;
  v_sound_name text;
  v_max_devices integer;
begin
  select coalesce(options.push_enabled, true),
    coalesce(options.play_sound, true),
    coalesce(options.show_preview, true)
  into v_push_enabled, v_play_sound, v_show_preview
  from (select 1) as singleton
  left join public.app_options as options on options.user_id = new.user_id;

  if not v_push_enabled or not private.service_switch_enabled('push.deliver', false) then
    return new;
  end if;

  if private.notification_push_is_quiet(new.account_id, new.source_id, new.created_at) then
    update public.notifications as notification
    set push_suppressed_reason = 'quiet_hours'
    where notification.id = new.id;
    return new;
  end if;

  select source.sound_name into v_sound_name
  from public.sources as source where source.id = new.source_id;
  v_max_devices := private.effective_limit(new.user_id, 'max_push_devices');

  insert into private.push_delivery_jobs (
    notification_id, user_id, push_device_id, push_device_id_snapshot,
    platform_snapshot, show_preview, play_sound, source_sound_snapshot
  )
  select
    new.id,
    new.user_id,
    device.id,
    device.id,
    device.platform,
    v_show_preview,
    v_play_sound,
    coalesce(v_sound_name, 'default')
  from public.push_devices as device
  where device.user_id = new.user_id
    and device.disabled_at is null
    and not exists (
      select 1
      from private.account_installation_subscriptions as subscription
      where subscription.user_id = new.user_id
        and subscription.installation_id::text = device.device_id
        and (not subscription.delivery_enabled or subscription.revoked_at is not null)
    )
  order by device.updated_at desc, device.id
  limit v_max_devices
  on conflict (notification_id, push_device_id_snapshot) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_notification_push_jobs()
from public, anon, authenticated;

create or replace function public.get_notification_delivery_summary(
  p_notification_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_notification_created_at timestamptz;
  v_suppressed_reason text;
  v_targeted integer;
  v_provider_accepted integer;
  v_failed integer;
  v_pending integer;
  v_updated_at timestamptz;
  v_state text;
  v_reason text;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  if p_notification_id is null then raise exception 'NOT_FOUND'; end if;

  select notification.created_at, notification.push_suppressed_reason
  into v_notification_created_at, v_suppressed_reason
  from public.notifications as notification
  where notification.id = p_notification_id
    and notification.user_id = v_user_id
    and notification.expires_at > pg_catalog.now();
  if not found then raise exception 'NOT_FOUND'; end if;

  select
    count(*)::integer,
    count(*) filter (where job.status = 'delivered')::integer,
    count(*) filter (where job.status in ('permanent_failed', 'receipt_unknown'))::integer,
    count(*) filter (where job.status in ('queued', 'retry', 'sending', 'ticket_pending', 'receiving'))::integer,
    max(job.updated_at),
    case
      when bool_or(job.last_error_code in ('DEVICE_UNAVAILABLE', 'DEVICE_NOT_REGISTERED')) then 'device_unavailable'
      when bool_or(job.last_error_code = 'MESSAGE_TOO_BIG') then 'message_too_big'
      when bool_or(job.last_error_code in ('MISMATCH_SENDER_ID', 'INVALID_CREDENTIALS')) then 'push_configuration'
      when bool_or(job.last_error_code in ('MESSAGE_RATE_EXCEEDED', 'EXPO_TIMEOUT', 'EXPO_UNAVAILABLE', 'EXPO_INVALID_RESPONSE', 'UNKNOWN_EXPO_ERROR')) then 'provider_unavailable'
      when bool_or(job.status = 'receipt_unknown' or job.last_error_code in ('RECEIPT_PENDING', 'RECEIPT_UNAVAILABLE')) then 'unconfirmed'
      else null
    end
  into v_targeted, v_provider_accepted, v_failed, v_pending, v_updated_at, v_reason
  from private.push_delivery_jobs as job
  where job.notification_id = p_notification_id and job.user_id = v_user_id;

  v_state := case
    when v_targeted = 0 then 'not_sent'
    when v_provider_accepted > 0 then 'sent'
    when v_pending = 0 then 'needs_attention'
    else 'queued'
  end;
  if v_state = 'not_sent' and v_suppressed_reason is not null then
    v_reason := v_suppressed_reason;
  elsif v_state <> 'needs_attention' then
    v_reason := null;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', v_state,
    'targetedPhones', v_targeted,
    'providerAccepted', v_provider_accepted,
    'failed', v_failed,
    'pending', v_pending,
    'updatedAt', coalesce(v_updated_at, v_notification_created_at),
    'reason', v_reason
  );
end;
$$;

create or replace function public.get_source_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  perform private.assert_active_zona_session();
  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = (select auth.uid());

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'sourceId', source.id,
      'lastAlertAt', activity.last_alert_at,
      'lastAlertTitle', activity.last_alert_title,
      'alertsLast24Hours', coalesce(activity.alerts_24h, 0),
      'targeted', coalesce(delivery.targeted, 0),
      'delivered', coalesce(delivery.delivered, 0),
      'failed', coalesce(delivery.failed, 0),
      'pending', coalesce(delivery.pending, 0),
      'deliverySuccessPercent', case when coalesce(delivery.targeted, 0) = 0 then null
        else pg_catalog.round(100.0 * delivery.delivered / delivery.targeted)::integer end
    ) order by source.created_at, source.id)
    from public.sources as source
    left join lateral (
      select
        max(notification.created_at) as last_alert_at,
        (array_agg(notification.title order by notification.created_at desc, notification.id desc))[1] as last_alert_title,
        count(*) filter (where notification.created_at >= pg_catalog.now() - interval '24 hours')::integer as alerts_24h
      from public.notifications as notification
      where notification.source_id = source.id
        and notification.expires_at > pg_catalog.now()
    ) as activity on true
    left join lateral (
      select
        count(*)::integer as targeted,
        count(*) filter (where job.status = 'delivered')::integer as delivered,
        count(*) filter (where job.status in ('permanent_failed', 'receipt_unknown'))::integer as failed,
        count(*) filter (where job.status in ('queued', 'retry', 'sending', 'ticket_pending', 'receiving'))::integer as pending
      from private.push_delivery_jobs as job
      join public.notifications as notification on notification.id = job.notification_id
      where notification.source_id = source.id
        and notification.created_at >= pg_catalog.now() - interval '24 hours'
    ) as delivery on true
    where source.account_id = v_account_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_inbox_page_v2(uuid, timestamptz, boolean, boolean, text, text, boolean, timestamptz, uuid, integer)
from public, anon, authenticated;
revoke all on function public.set_inbox_notification_pin(uuid, boolean)
from public, anon, authenticated;
revoke all on function public.list_saved_inbox_filters()
from public, anon, authenticated;
revoke all on function public.save_inbox_filter(uuid, text, text, uuid, boolean, boolean, text, integer)
from public, anon, authenticated;
revoke all on function public.delete_saved_inbox_filter(uuid)
from public, anon, authenticated;
revoke all on function public.get_notification_schedule(uuid)
from public, anon, authenticated;
revoke all on function public.set_notification_schedule(uuid, boolean, text, smallint[], integer, integer)
from public, anon, authenticated;
revoke all on function public.get_source_health()
from public, anon, authenticated;
revoke all on function public.get_notification_delivery_summary(uuid)
from public, anon, authenticated;

grant execute on function public.get_inbox_page_v2(uuid, timestamptz, boolean, boolean, text, text, boolean, timestamptz, uuid, integer)
to authenticated;
grant execute on function public.set_inbox_notification_pin(uuid, boolean)
to authenticated;
grant execute on function public.list_saved_inbox_filters()
to authenticated;
grant execute on function public.save_inbox_filter(uuid, text, text, uuid, boolean, boolean, text, integer)
to authenticated;
grant execute on function public.delete_saved_inbox_filter(uuid)
to authenticated;
grant execute on function public.get_notification_schedule(uuid)
to authenticated;
grant execute on function public.set_notification_schedule(uuid, boolean, text, smallint[], integer, integer)
to authenticated;
grant execute on function public.get_source_health()
to authenticated;
grant execute on function public.get_notification_delivery_summary(uuid)
to authenticated;

comment on function public.get_inbox_page_v2(uuid, timestamptz, boolean, boolean, text, text, boolean, timestamptz, uuid, integer) is
  'Owner-scoped searchable inbox page with pinned-first keyset pagination.';
comment on function public.set_notification_schedule(uuid, boolean, text, smallint[], integer, integer) is
  'Sets account quiet hours when source is null, or the selected source schedule otherwise.';

with feature_data(control_key, category, operator_label, operator_description, sort_order) as (
  values
    ('inbox.search', 'inbox', 'Inbox search', 'Searches the signed-in owner inbox across alert and source fields.', 70),
    ('inbox.saved_filters', 'inbox', 'Saved inbox filters', 'Lets an owner save and reuse bounded inbox filter combinations.', 71),
    ('inbox.pinned_filter', 'inbox', 'Pinned filter', 'Shows the pinned-only inbox filter.', 72),
    ('inbox.severity_filter', 'inbox', 'Severity filter', 'Shows the severity inbox filters.', 73),
    ('inbox.grouping', 'inbox', 'Repeated alert grouping', 'Groups consecutive repeated alerts without deleting individual records.', 74),
    ('notification.pin', 'notification', 'Pin alerts', 'Lets an owner keep selected alerts at the top of the inbox.', 80),
    ('notification.mark_unread', 'notification', 'Mark unread', 'Lets an owner return an alert to the unread state.', 81),
    ('sources.health', 'sources', 'Source health', 'Shows recent alert activity and aggregate delivery health for owned sources.', 90),
    ('sources.schedule', 'sources', 'Source quiet schedules', 'Lets an owner mute pushes from one source on a recurring schedule.', 91),
    ('settings.quiet_hours', 'settings', 'Account quiet hours', 'Lets an owner mute account pushes on a recurring schedule.', 100),
    ('status.copy_diagnostics', 'status', 'Copy diagnostics', 'Copies a redacted diagnostic summary for user support.', 110),
    ('onboarding.first_alert', 'onboarding', 'First alert guide', 'Shows the guided first-alert setup and integration templates.', 120),
    ('ios.widget', 'ios', 'iOS inbox widget', 'Updates the native iOS widget with safe inbox summary fields.', 130),
    ('ios.shortcuts', 'ios', 'iOS Shortcuts', 'Publishes Zona actions to Apple Shortcuts and Siri.', 131)
)
insert into private.app_control_catalog (
  control_key, control_kind, category, operator_label, operator_description,
  value_type, default_value, allowed_values, sort_order
)
select control_key, 'feature', category, operator_label, operator_description,
  'feature_mode', to_jsonb('enabled'::text),
  '["enabled","disabled","hidden","read_only"]'::jsonb, sort_order
from feature_data
on conflict (control_key) do update set
  control_kind = excluded.control_kind,
  category = excluded.category,
  operator_label = excluded.operator_label,
  operator_description = excluded.operator_description,
  value_type = excluded.value_type,
  default_value = excluded.default_value,
  allowed_values = excluded.allowed_values,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = pg_catalog.now();

insert into private.app_feature_controls (feature_key, mode, priority)
select catalog.control_key, 'enabled', 0
from private.app_control_catalog as catalog
where catalog.control_key = any(array[
    'inbox.search', 'inbox.saved_filters', 'inbox.pinned_filter',
    'inbox.severity_filter', 'inbox.grouping', 'notification.pin',
    'notification.mark_unread', 'sources.health', 'sources.schedule',
    'settings.quiet_hours', 'status.copy_diagnostics',
    'onboarding.first_alert', 'ios.widget', 'ios.shortcuts'
  ]::text[])
  and not exists (
    select 1 from private.app_feature_controls as control
    where control.feature_key = catalog.control_key
      and control.platform is null
      and control.release_channel is null
      and control.locale is null
      and control.account_tier is null
      and control.priority = 0
  );

insert into private.app_feature_controls (feature_key, mode, platform, priority)
values
  ('ios.widget', 'hidden', 'android', 10),
  ('ios.shortcuts', 'hidden', 'android', 10);

update public.app_release_notes
set title_en = 'Keep the signal, lose the noise',
    title_zh_hant = '保留訊號，減少雜音',
    summary_en = 'Find the alert you need, quiet the hours you protect, and keep important signals close at hand.',
    summary_zh_hant = '找出所需通知、守護安靜時段，並將重要訊號放在最順手的位置。',
    legacy_items = '[
      {"key":"find-any-alert","icon":"magnifyingglass","is_active":true,"title_en":"Find any alert in seconds","title_zh_hant":"數秒內找出通知","body_en":"Search every alert and save the views you return to, whether you follow one source, a severity, or unread work.","body_zh_hant":"搜尋所有通知，並儲存常用畫面，無論你要追蹤特定來源、嚴重程度或未讀工作，都能立即重用。"},
      {"key":"protect-focus","icon":"moon.stars.fill","is_active":true,"title_en":"Protect focus without missing a thing","title_zh_hant":"專心工作，不漏任何通知","body_en":"Set quiet hours for everything or just one noisy source. Every alert still waits safely in your inbox.","body_zh_hant":"為所有通知或單一繁忙來源設定安靜時段，每則通知仍會安全保留在信箱。"},
      {"key":"glance-and-go","icon":"rectangle.3.group.fill","is_active":true,"title_en":"Your signal at a glance","title_zh_hant":"一眼掌握重要訊號","body_en":"Pin important alerts, group repeats, check source health, and see unread work from an iPhone widget.","body_zh_hant":"釘選重要通知、收起重複訊息、查看來源狀態，並透過 iPhone 小工具掌握未讀工作。"}
    ]'::jsonb,
    is_active = false,
    updated_at = pg_catalog.now()
where version = '0.0.10';

update public.app_release_note_items
set is_active = false,
    updated_at = pg_catalog.now()
where release_id = (select id from public.app_release_notes where version = '0.0.10');

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('find-any-alert', 'magnifyingglass', 'Find any alert in seconds', '數秒內找出通知', 'Search every alert and save the views you return to, whether you follow one source, a severity, or unread work.', '搜尋所有通知，並儲存常用畫面，無論你要追蹤特定來源、嚴重程度或未讀工作，都能立即重用。', 0),
    ('protect-focus', 'moon.stars.fill', 'Protect focus without missing a thing', '專心工作，不漏任何通知', 'Set quiet hours for everything or just one noisy source. Every alert still waits safely in your inbox.', '為所有通知或單一繁忙來源設定安靜時段，每則通知仍會安全保留在信箱。', 1),
    ('glance-and-go', 'rectangle.3.group.fill', 'Your signal at a glance', '一眼掌握重要訊號', 'Pin important alerts, group repeats, check source health, and see unread work from an iPhone widget.', '釘選重要通知、收起重複訊息、查看來源狀態，並透過 iPhone 小工具掌握未讀工作。', 2)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.10'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = pg_catalog.now();

-- Expo already checks for compatible updates on launch. Hide the retired
-- foreground watcher for older clients so they do not show a second prompt.
update private.app_control_catalog
set is_active = false,
    updated_at = pg_catalog.now()
where control_key = 'background.ota_updates';

insert into private.app_feature_controls (
  feature_key, mode, reason_en, reason_zh_hant, priority
)
values (
  'background.ota_updates', 'hidden',
  'Automatic update checks now happen as part of app launch.',
  '自動更新檢查現已整合至應用程式啟動流程。',
  1000
);
