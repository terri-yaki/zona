-- v0.0.8 durable Expo delivery and private account usage projections.

create table private.push_delivery_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  push_device_id uuid references public.push_devices(id) on delete set null,
  push_device_id_snapshot uuid not null,
  platform_snapshot text not null check (platform_snapshot in ('ios', 'android')),
  show_preview boolean not null,
  play_sound boolean not null,
  source_sound_snapshot text not null,
  status text not null default 'queued' check (
    status in ('queued', 'retry', 'sending', 'ticket_pending', 'receiving',
      'delivered', 'permanent_failed', 'receipt_unknown')
  ),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  receipt_attempt_count integer not null default 0 check (receipt_attempt_count between 0 and 8),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  receipt_next_check_at timestamptz,
  lease_owner uuid,
  lease_expires_at timestamptz,
  expo_ticket_id text check (expo_ticket_id is null or char_length(expo_ticket_id) between 1 and 200),
  last_error_code text check (
    last_error_code is null or last_error_code in (
      'DEVICE_UNAVAILABLE', 'DEVICE_NOT_REGISTERED', 'MESSAGE_TOO_BIG',
      'MESSAGE_RATE_EXCEEDED', 'MISMATCH_SENDER_ID', 'INVALID_CREDENTIALS',
      'EXPO_TIMEOUT', 'EXPO_UNAVAILABLE', 'EXPO_INVALID_RESPONSE',
      'RECEIPT_PENDING', 'RECEIPT_UNAVAILABLE', 'UNKNOWN_EXPO_ERROR'
    )
  ),
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (notification_id, push_device_id_snapshot),
  check ((status in ('sending', 'receiving')) = (lease_owner is not null and lease_expires_at is not null)),
  check ((status in ('delivered', 'permanent_failed', 'receipt_unknown')) = (completed_at is not null))
);

create index push_delivery_jobs_send_idx
on private.push_delivery_jobs (next_attempt_at, created_at)
where status in ('queued', 'retry', 'sending');

create index push_delivery_jobs_receipt_idx
on private.push_delivery_jobs (receipt_next_check_at, updated_at)
where status in ('ticket_pending', 'receiving');

create index push_delivery_jobs_notification_idx
on private.push_delivery_jobs (notification_id, status);

create table private.account_usage_counters (
  account_id uuid primary key references private.accounts(id) on delete cascade,
  accepted_alerts_total bigint not null default 0 check (accepted_alerts_total >= 0),
  accepted_attachment_bytes_total bigint not null default 0 check (accepted_attachment_bytes_total >= 0),
  last_alert_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now()
);

create table private.account_usage_daily (
  account_id uuid not null references private.accounts(id) on delete cascade,
  usage_date date not null,
  accepted_alerts bigint not null default 0 check (accepted_alerts >= 0),
  accepted_attachments bigint not null default 0 check (accepted_attachments >= 0),
  accepted_attachment_bytes bigint not null default 0 check (accepted_attachment_bytes >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, usage_date)
);

create index account_usage_daily_recent_idx
on private.account_usage_daily (usage_date desc, account_id);

create or replace function private.transfer_account_usage_to_destination()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'transferred'
    and new.transferred_to_account_id is not null then
    insert into private.account_usage_counters (
      account_id, accepted_alerts_total, accepted_attachment_bytes_total,
      last_alert_at, updated_at
    ) select
      new.transferred_to_account_id, usage.accepted_alerts_total,
      usage.accepted_attachment_bytes_total, usage.last_alert_at, pg_catalog.now()
    from private.account_usage_counters as usage where usage.account_id = new.id
    on conflict (account_id) do update set
      accepted_alerts_total = private.account_usage_counters.accepted_alerts_total
        + excluded.accepted_alerts_total,
      accepted_attachment_bytes_total = private.account_usage_counters.accepted_attachment_bytes_total
        + excluded.accepted_attachment_bytes_total,
      last_alert_at = greatest(private.account_usage_counters.last_alert_at, excluded.last_alert_at),
      updated_at = pg_catalog.now();

    insert into private.account_usage_daily (
      account_id, usage_date, accepted_alerts, accepted_attachments,
      accepted_attachment_bytes, updated_at
    ) select
      new.transferred_to_account_id, usage.usage_date, usage.accepted_alerts,
      usage.accepted_attachments, usage.accepted_attachment_bytes, pg_catalog.now()
    from private.account_usage_daily as usage where usage.account_id = new.id
    on conflict (account_id, usage_date) do update set
      accepted_alerts = private.account_usage_daily.accepted_alerts + excluded.accepted_alerts,
      accepted_attachments = private.account_usage_daily.accepted_attachments + excluded.accepted_attachments,
      accepted_attachment_bytes = private.account_usage_daily.accepted_attachment_bytes
        + excluded.accepted_attachment_bytes,
      updated_at = pg_catalog.now();
    delete from private.account_usage_daily where account_id = new.id;
    delete from private.account_usage_counters where account_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.transfer_account_usage_to_destination()
from public, anon, authenticated;
create trigger accounts_transfer_usage_to_destination
after update of status on private.accounts
for each row execute function private.transfer_account_usage_to_destination();

revoke all on private.push_delivery_jobs, private.account_usage_counters,
  private.account_usage_daily from public, anon, authenticated;

-- A revoked session remains denied even if its installation binding is later
-- deleted. The shared installation lock closes bind/revoke races.
create table private.revoked_auth_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references private.accounts(id) on delete cascade,
  installation_id uuid,
  reason text not null check (reason in ('installation_revoked', 'account_deleting')),
  revoked_at timestamptz not null default pg_catalog.now()
);

create index revoked_auth_sessions_user_idx
on private.revoked_auth_sessions (user_id, revoked_at desc);
revoke all on private.revoked_auth_sessions from public, anon, authenticated;

insert into private.revoked_auth_sessions (
  session_id, user_id, account_id, installation_id, reason, revoked_at
)
select binding.session_id, binding.user_id, binding.account_id,
  binding.installation_id, 'installation_revoked', binding.revoked_at
from private.installation_sessions as binding
where binding.status = 'revoked' and binding.revoked_at is not null
on conflict (session_id) do nothing;

create or replace function private.enforce_installation_session_denylist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and exists (
    select 1 from private.revoked_auth_sessions as denied
    where denied.session_id = new.session_id
  ) then raise exception 'INVALID_SESSION'; end if;
  return new;
end;
$$;

create or replace function private.remember_revoked_installation_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'revoked' and new.revoked_at is not null then
    insert into private.revoked_auth_sessions (
      session_id, user_id, account_id, installation_id, reason, revoked_at
    ) values (
      new.session_id, new.user_id, new.account_id, new.installation_id,
      case when exists (
        select 1 from private.accounts as account
        where account.id = new.account_id and account.status in ('deleting', 'deleted')
      ) then 'account_deleting' else 'installation_revoked' end,
      new.revoked_at
    ) on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_installation_session_denylist() from public, anon, authenticated;
revoke all on function private.remember_revoked_installation_session() from public, anon, authenticated;

create trigger installation_sessions_block_denied
before insert or update of status, revoked_at on private.installation_sessions
for each row execute function private.enforce_installation_session_denylist();

create trigger installation_sessions_remember_revocation
after insert or update of status, revoked_at on private.installation_sessions
for each row execute function private.remember_revoked_installation_session();

create or replace function public.request_has_active_zona_session()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_session_id();
begin
  if v_user_id is null or v_session_id is null then return false; end if;
  return exists (
    select 1
    from auth.sessions as auth_session
    join private.personal_account_owners as owner on owner.user_id = v_user_id
    join private.accounts as account on account.id = owner.account_id
    join private.account_memberships as membership
      on membership.account_id = account.id and membership.user_id = v_user_id
     and membership.status = 'active'
    where auth_session.id = v_session_id and auth_session.user_id = v_user_id
      and account.status = 'active'
      and not exists (
        select 1 from private.revoked_auth_sessions as denied
        where denied.session_id = v_session_id
      )
      and not exists (
        select 1 from private.installation_sessions as binding
        where binding.session_id = v_session_id
          and (binding.status = 'revoked' or binding.revoked_at is not null)
      )
  );
end;
$$;

revoke all on function public.request_has_active_zona_session() from public, anon, authenticated;
grant execute on function public.request_has_active_zona_session() to authenticated;

create or replace function public.assert_account_session_active_internal(
  p_user_id uuid,
  p_session_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  v_account_id := public.assert_account_active_internal(p_user_id);
  if p_session_id is null or not exists (
    select 1 from auth.sessions as auth_session
    where auth_session.id = p_session_id and auth_session.user_id = p_user_id
  ) or exists (
    select 1 from private.revoked_auth_sessions as denied
    where denied.session_id = p_session_id
  ) or exists (
    select 1 from private.installation_sessions as binding
    where binding.session_id = p_session_id
      and (binding.status = 'revoked' or binding.revoked_at is not null)
  ) then raise exception 'INVALID_SESSION'; end if;
  return v_account_id;
end;
$$;

revoke all on function public.assert_account_session_active_internal(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.assert_account_session_active_internal(uuid, uuid) to service_role;

alter function public.bind_account_installation_internal(uuid, uuid, uuid, text, text, integer, text)
rename to bind_account_installation_unlocked_body_v0_0_8;
revoke all on function public.bind_account_installation_unlocked_body_v0_0_8(uuid, uuid, uuid, text, text, integer, text)
from public, anon, authenticated;

create function public.bind_account_installation_internal(
  p_user_id uuid,
  p_session_id uuid,
  p_installation_id uuid,
  p_platform text,
  p_app_version text default null,
  p_build_number integer default null,
  p_display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_installation_id is null or p_session_id is null then raise exception 'INVALID_INSTALLATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:installation:' || p_installation_id::text, 0)
  );
  if exists (
    select 1 from private.revoked_auth_sessions as denied
    where denied.session_id = p_session_id
  ) then raise exception 'INVALID_SESSION'; end if;
  return public.bind_account_installation_unlocked_body_v0_0_8(
    p_user_id, p_session_id, p_installation_id, p_platform,
    p_app_version, p_build_number, p_display_name
  );
end;
$$;

alter function public.revoke_account_installation_internal(uuid, uuid, uuid)
rename to revoke_account_installation_unlocked_body_v0_0_8;
revoke all on function public.revoke_account_installation_unlocked_body_v0_0_8(uuid, uuid, uuid)
from public, anon, authenticated;

create function public.revoke_account_installation_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_installation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_installation_id is null then raise exception 'INVALID_INSTALLATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:installation:' || p_installation_id::text, 0)
  );
  return public.revoke_account_installation_unlocked_body_v0_0_8(
    p_user_id, p_actor_session_id, p_installation_id
  );
end;
$$;

revoke all on function public.bind_account_installation_internal(uuid, uuid, uuid, text, text, integer, text)
from public, anon, authenticated;
revoke all on function public.revoke_account_installation_internal(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.bind_account_installation_internal(uuid, uuid, uuid, text, text, integer, text)
to service_role;
grant execute on function public.revoke_account_installation_internal(uuid, uuid, uuid) to service_role;

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

revoke all on function private.enqueue_notification_push_jobs() from public, anon, authenticated;

create trigger notifications_enqueue_push_jobs
after insert on public.notifications
for each row execute function private.enqueue_notification_push_jobs();

create or replace function private.follow_notification_owner_for_push_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is distinct from new.user_id then
    update private.push_delivery_jobs set user_id = new.user_id, updated_at = pg_catalog.now()
    where notification_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.follow_notification_owner_for_push_jobs() from public, anon, authenticated;
create trigger notifications_move_push_jobs_with_owner
after update of user_id on public.notifications
for each row execute function private.follow_notification_owner_for_push_jobs();

create or replace function private.record_notification_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = new.user_id;
  if v_account_id is null then return new; end if;

  insert into private.account_usage_counters (
    account_id, accepted_alerts_total, last_alert_at
  ) values (v_account_id, 1, new.created_at)
  on conflict (account_id) do update set
    accepted_alerts_total = private.account_usage_counters.accepted_alerts_total + 1,
    last_alert_at = greatest(private.account_usage_counters.last_alert_at, excluded.last_alert_at),
    updated_at = pg_catalog.now();

  insert into private.account_usage_daily (account_id, usage_date, accepted_alerts)
  values (v_account_id, (new.created_at at time zone 'UTC')::date, 1)
  on conflict (account_id, usage_date) do update set
    accepted_alerts = private.account_usage_daily.accepted_alerts + 1,
    updated_at = pg_catalog.now();
  return new;
end;
$$;

create or replace function private.record_notification_attachment_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  if old.attachment_bytes is not null or new.attachment_bytes is null then return new; end if;
  select owner.account_id into v_account_id
  from private.personal_account_owners as owner where owner.user_id = new.user_id;
  if v_account_id is null then return new; end if;

  insert into private.account_usage_counters (account_id, accepted_attachment_bytes_total)
  values (v_account_id, new.attachment_bytes)
  on conflict (account_id) do update set
    accepted_attachment_bytes_total = private.account_usage_counters.accepted_attachment_bytes_total
      + excluded.accepted_attachment_bytes_total,
    updated_at = pg_catalog.now();

  insert into private.account_usage_daily (
    account_id, usage_date, accepted_attachments, accepted_attachment_bytes
  ) values (
    v_account_id, (new.created_at at time zone 'UTC')::date, 1, new.attachment_bytes
  )
  on conflict (account_id, usage_date) do update set
    accepted_attachments = private.account_usage_daily.accepted_attachments + 1,
    accepted_attachment_bytes = private.account_usage_daily.accepted_attachment_bytes
      + excluded.accepted_attachment_bytes,
    updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.record_notification_usage() from public, anon, authenticated;
revoke all on function private.record_notification_attachment_usage() from public, anon, authenticated;

create trigger notifications_record_account_usage
after insert on public.notifications
for each row execute function private.record_notification_usage();

create trigger notifications_record_attachment_usage
after update of attachment_bytes on public.notifications
for each row execute function private.record_notification_attachment_usage();

-- Seed projections from currently retained data. Historical totals before the
-- retention window are intentionally unknown and never invented.
insert into private.account_usage_counters (
  account_id, accepted_alerts_total, accepted_attachment_bytes_total, last_alert_at
)
select
  owner.account_id,
  count(notification.id),
  coalesce(sum(notification.attachment_bytes), 0),
  max(notification.created_at)
from private.personal_account_owners as owner
left join public.notifications as notification on notification.user_id = owner.user_id
group by owner.account_id
on conflict (account_id) do nothing;

insert into private.account_usage_daily (
  account_id, usage_date, accepted_alerts, accepted_attachments, accepted_attachment_bytes
)
select
  owner.account_id,
  (notification.created_at at time zone 'UTC')::date,
  count(*),
  count(*) filter (where notification.attachment_bytes is not null),
  coalesce(sum(notification.attachment_bytes), 0)
from private.personal_account_owners as owner
join public.notifications as notification on notification.user_id = owner.user_id
group by owner.account_id, (notification.created_at at time zone 'UTC')::date
on conflict (account_id, usage_date) do nothing;

create or replace function public.get_notification_push_queue_count_internal(
  p_user_id uuid,
  p_notification_id uuid
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from private.push_delivery_jobs as job
  where job.user_id = p_user_id and job.notification_id = p_notification_id;
$$;

create or replace function public.claim_push_delivery_jobs_internal(
  p_worker_id uuid,
  p_limit integer default 100
) returns table (
  job_id uuid,
  notification_id uuid,
  owner_user_id uuid,
  push_device_id uuid,
  expo_push_token text,
  platform text,
  title text,
  body text,
  source_name text,
  source_id uuid,
  severity text,
  show_preview boolean,
  sound_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'INVALID_WORKER_CLAIM';
  end if;

  update private.push_delivery_jobs as exhausted
  set status = 'permanent_failed', last_error_code = 'EXPO_UNAVAILABLE',
      lease_owner = null, lease_expires_at = null,
      completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where exhausted.status = 'sending'
    and exhausted.lease_expires_at <= pg_catalog.now()
    and exhausted.attempt_count >= 5;

  update private.push_delivery_jobs as unavailable
  set status = 'permanent_failed', last_error_code = 'DEVICE_UNAVAILABLE',
      lease_owner = null, lease_expires_at = null,
      completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where unavailable.status in ('queued', 'retry', 'sending')
    and (unavailable.status <> 'sending' or unavailable.lease_expires_at <= pg_catalog.now())
    and not exists (
      select 1 from public.push_devices as device
      where device.id = unavailable.push_device_id
        and device.user_id = unavailable.user_id
        and device.disabled_at is null
    );

  return query
  with candidates as (
    select job.id
    from private.push_delivery_jobs as job
    where (
      (job.status in ('queued', 'retry') and job.next_attempt_at <= pg_catalog.now())
      or (job.status = 'sending' and job.lease_expires_at <= pg_catalog.now())
    )
      and job.attempt_count < 5
    order by job.next_attempt_at, job.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update private.push_delivery_jobs as job
    set status = 'sending',
        attempt_count = job.attempt_count + 1,
        lease_owner = p_worker_id,
        lease_expires_at = pg_catalog.now() + interval '2 minutes',
        updated_at = pg_catalog.now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select
    claimed.id,
    claimed.notification_id,
    claimed.user_id,
    device.id,
    device.expo_push_token,
    claimed.platform_snapshot,
    notification.title,
    notification.body,
    notification.source_name_snapshot,
    notification.source_id,
    notification.severity,
    claimed.show_preview,
    case when claimed.play_sound then claimed.source_sound_snapshot else 'silent' end
  from claimed
  join public.notifications as notification on notification.id = claimed.notification_id
  join public.push_devices as device
    on device.id = claimed.push_device_id
   and device.user_id = claimed.user_id
   and device.disabled_at is null;
end;
$$;

create or replace function public.accept_push_delivery_ticket_internal(
  p_job_id uuid,
  p_worker_id uuid,
  p_ticket_id text,
  p_http_status integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ticket_id is null or char_length(p_ticket_id) not between 1 and 200
    or p_http_status not between 200 and 299 then
    raise exception 'INVALID_PUSH_TICKET';
  end if;
  update private.push_delivery_jobs as job
  set status = 'ticket_pending', expo_ticket_id = p_ticket_id,
      receipt_next_check_at = pg_catalog.now() + interval '15 minutes',
      last_http_status = p_http_status, last_error_code = null,
      lease_owner = null, lease_expires_at = null, updated_at = pg_catalog.now()
  where job.id = p_job_id and job.status = 'sending' and job.lease_owner = p_worker_id;
  return found;
end;
$$;

create or replace function public.fail_push_delivery_job_internal(
  p_job_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_permanent boolean,
  p_http_status integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.push_delivery_jobs%rowtype;
  v_terminal boolean;
begin
  if p_error_code not in (
    'DEVICE_UNAVAILABLE', 'DEVICE_NOT_REGISTERED', 'MESSAGE_TOO_BIG',
    'MESSAGE_RATE_EXCEEDED', 'MISMATCH_SENDER_ID', 'INVALID_CREDENTIALS',
    'EXPO_TIMEOUT', 'EXPO_UNAVAILABLE', 'EXPO_INVALID_RESPONSE', 'UNKNOWN_EXPO_ERROR'
  ) or (p_http_status is not null and p_http_status not between 100 and 599) then
    raise exception 'INVALID_PUSH_FAILURE';
  end if;

  select job.* into v_job from private.push_delivery_jobs as job
  where job.id = p_job_id and job.status = 'sending' and job.lease_owner = p_worker_id
  for update;
  if not found then return pg_catalog.jsonb_build_object('updated', false); end if;
  v_terminal := p_permanent or v_job.attempt_count >= 5;

  update private.push_delivery_jobs
  set status = case when v_terminal then 'permanent_failed' else 'retry' end,
      next_attempt_at = case when v_terminal then next_attempt_at else
        pg_catalog.now()
        + make_interval(secs => least(3600, 30 * (2 ^ greatest(0, attempt_count - 1))::integer))
        + make_interval(secs => mod(abs(pg_catalog.hashtext(id::text || attempt_count::text)), 17))
      end,
      last_error_code = p_error_code,
      last_http_status = p_http_status,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = case when v_terminal then pg_catalog.now() else null end,
      updated_at = pg_catalog.now()
  where id = p_job_id;

  if p_error_code = 'DEVICE_NOT_REGISTERED' then
    update public.push_devices set disabled_at = coalesce(disabled_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
    where id = v_job.push_device_id and user_id = v_job.user_id;
    update private.account_installation_subscriptions set delivery_enabled = false,
      updated_at = pg_catalog.now()
    where user_id = v_job.user_id
      and installation_id::text = (
        select device.device_id from public.push_devices as device where device.id = v_job.push_device_id
      );
  end if;

  return pg_catalog.jsonb_build_object(
    'updated', true, 'terminal', v_terminal,
    'attemptCount', v_job.attempt_count, 'errorCode', p_error_code
  );
end;
$$;

create or replace function public.claim_push_receipt_jobs_internal(
  p_worker_id uuid,
  p_limit integer default 100
) returns table (job_id uuid, expo_ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'INVALID_WORKER_CLAIM';
  end if;

  update private.push_delivery_jobs as exhausted
  set status = 'receipt_unknown', last_error_code = 'RECEIPT_UNAVAILABLE',
      lease_owner = null, lease_expires_at = null,
      completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where exhausted.status = 'receiving'
    and exhausted.lease_expires_at <= pg_catalog.now()
    and exhausted.receipt_attempt_count >= 8;

  return query
  with candidates as (
    select job.id
    from private.push_delivery_jobs as job
    where (
      (job.status = 'ticket_pending' and job.receipt_next_check_at <= pg_catalog.now())
      or (job.status = 'receiving' and job.lease_expires_at <= pg_catalog.now())
    )
      and job.receipt_attempt_count < 8
    order by job.receipt_next_check_at, job.updated_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update private.push_delivery_jobs as job
    set status = 'receiving', receipt_attempt_count = job.receipt_attempt_count + 1,
        lease_owner = p_worker_id,
        lease_expires_at = pg_catalog.now() + interval '2 minutes',
        updated_at = pg_catalog.now()
    from candidates where job.id = candidates.id
    returning job.id, job.expo_ticket_id
  )
  select claimed.id, claimed.expo_ticket_id from claimed;
end;
$$;

create or replace function public.complete_push_delivery_job_internal(
  p_job_id uuid,
  p_worker_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_http_status integer default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_job private.push_delivery_jobs%rowtype;
begin
  if p_outcome not in ('delivered', 'permanent_failed')
    or (p_outcome = 'delivered' and p_error_code is not null)
    or (p_outcome = 'permanent_failed' and p_error_code not in (
      'DEVICE_NOT_REGISTERED', 'MESSAGE_TOO_BIG', 'MISMATCH_SENDER_ID',
      'INVALID_CREDENTIALS', 'UNKNOWN_EXPO_ERROR'
    ))
    or (p_http_status is not null and p_http_status not between 100 and 599) then
    raise exception 'INVALID_PUSH_COMPLETION';
  end if;

  select job.* into v_job from private.push_delivery_jobs as job
  where job.id = p_job_id and job.status = 'receiving' and job.lease_owner = p_worker_id
  for update;
  if not found then return false; end if;

  update private.push_delivery_jobs
  set status = p_outcome,
      last_error_code = p_error_code,
      last_http_status = p_http_status,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_job_id;

  if p_error_code = 'DEVICE_NOT_REGISTERED' then
    update public.push_devices set disabled_at = coalesce(disabled_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
    where id = v_job.push_device_id and user_id = v_job.user_id;
    update private.account_installation_subscriptions set delivery_enabled = false,
      updated_at = pg_catalog.now()
    where user_id = v_job.user_id
      and installation_id::text = (
        select device.device_id from public.push_devices as device where device.id = v_job.push_device_id
      );
  end if;
  return true;
end;
$$;

create or replace function public.defer_push_receipt_internal(
  p_job_id uuid,
  p_worker_id uuid,
  p_error_code text default 'RECEIPT_PENDING',
  p_http_status integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.push_delivery_jobs%rowtype;
  v_terminal boolean;
begin
  if p_error_code not in ('RECEIPT_PENDING', 'RECEIPT_UNAVAILABLE')
    or (p_http_status is not null and p_http_status not between 100 and 599) then
    raise exception 'INVALID_RECEIPT_FAILURE';
  end if;
  select job.* into v_job from private.push_delivery_jobs as job
  where job.id = p_job_id and job.status = 'receiving' and job.lease_owner = p_worker_id
  for update;
  if not found then return pg_catalog.jsonb_build_object('updated', false); end if;
  v_terminal := v_job.receipt_attempt_count >= 8;

  update private.push_delivery_jobs
  set status = case when v_terminal then 'receipt_unknown' else 'ticket_pending' end,
      receipt_next_check_at = case when v_terminal then receipt_next_check_at else
        pg_catalog.now()
        + make_interval(secs => least(3600, 60 * (2 ^ greatest(0, receipt_attempt_count - 1))::integer))
        + make_interval(secs => mod(abs(pg_catalog.hashtext(id::text || receipt_attempt_count::text)), 29))
      end,
      last_error_code = p_error_code,
      last_http_status = p_http_status,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = case when v_terminal then pg_catalog.now() else null end,
      updated_at = pg_catalog.now()
  where id = p_job_id;
  return pg_catalog.jsonb_build_object(
    'updated', true, 'terminal', v_terminal,
    'receiptAttemptCount', v_job.receipt_attempt_count
  );
end;
$$;

create or replace function public.retry_push_delivery_from_receipt_internal(
  p_job_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_http_status integer default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_job private.push_delivery_jobs%rowtype;
begin
  if p_error_code not in ('MESSAGE_RATE_EXCEEDED', 'UNKNOWN_EXPO_ERROR')
    or (p_http_status is not null and p_http_status not between 100 and 599) then
    raise exception 'INVALID_RECEIPT_RETRY';
  end if;
  select job.* into v_job from private.push_delivery_jobs as job
  where job.id = p_job_id and job.status = 'receiving' and job.lease_owner = p_worker_id
  for update;
  if not found then return false; end if;

  update private.push_delivery_jobs
  set status = case when attempt_count >= 5 then 'permanent_failed' else 'retry' end,
      next_attempt_at = pg_catalog.now()
        + make_interval(secs => least(3600, 30 * (2 ^ greatest(0, attempt_count - 1))::integer))
        + make_interval(secs => mod(abs(pg_catalog.hashtext(id::text || attempt_count::text)), 17)),
      expo_ticket_id = null,
      receipt_next_check_at = null,
      last_error_code = p_error_code,
      last_http_status = p_http_status,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = case when attempt_count >= 5 then pg_catalog.now() else null end,
      updated_at = pg_catalog.now()
  where id = p_job_id;
  return true;
end;
$$;

create or replace function public.get_account_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account_id uuid;
  v_sources integer;
  v_active_keys integer;
  v_phones integer;
  v_retained_alerts integer;
  v_attachments integer;
  v_attachment_bytes bigint;
  v_alerts_24h integer;
  v_alerts_7d integer;
begin
  perform private.assert_active_zona_session();
  select owner.account_id into strict v_account_id
  from private.personal_account_owners as owner where owner.user_id = v_user_id;

  select count(*)::integer into v_sources
  from public.sources as source
  where source.user_id = v_user_id and source.revoked_at is null;

  select count(*)::integer into v_active_keys
  from public.api_keys as access_key
  where access_key.user_id = v_user_id and access_key.is_active
    and access_key.revoked_at is null
    and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now());

  select count(*)::integer into v_phones
  from private.account_installation_subscriptions as subscription
  where subscription.account_id = v_account_id and subscription.user_id = v_user_id
    and subscription.revoked_at is null;

  select count(*)::integer,
    count(*) filter (where notification.attachment_bytes is not null)::integer,
    coalesce(sum(notification.attachment_bytes), 0),
    count(*) filter (where notification.created_at >= pg_catalog.now() - interval '24 hours')::integer,
    count(*) filter (where notification.created_at >= pg_catalog.now() - interval '7 days')::integer
  into v_retained_alerts, v_attachments, v_attachment_bytes, v_alerts_24h, v_alerts_7d
  from public.notifications as notification
  where notification.user_id = v_user_id and notification.expires_at > pg_catalog.now();

  return pg_catalog.jsonb_build_object(
    'sources', v_sources,
    'activeKeys', v_active_keys,
    'phones', v_phones,
    'retainedAlerts', v_retained_alerts,
    'attachments', v_attachments,
    'attachmentBytes', v_attachment_bytes,
    'alertsLast24Hours', v_alerts_24h,
    'alertsLast7Days', v_alerts_7d,
    'limits', pg_catalog.jsonb_build_object(
      'maxSourceKeys', private.effective_limit(v_user_id, 'max_api_keys'),
      'maxAccessKeysPerSource', 10,
      'maxPushDevices', private.effective_limit(v_user_id, 'max_push_devices'),
      'retentionDays', private.effective_limit(v_user_id, 'retention_days'),
      'maxAttachmentBytes', private.effective_limit(v_user_id, 'attachment_max_bytes'),
      'accountNotifyRpm', private.effective_limit(v_user_id, 'notify_rpm'),
      'sourceNotifyRpm', private.effective_limit(v_user_id, 'source_notify_rpm')
    ),
    'generatedAt', pg_catalog.now()
  );
end;
$$;

create or replace function private.purge_deleted_account_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'transferred'
    and new.transferred_to_account_id is not null then
    insert into private.account_usage_counters (
      account_id, accepted_alerts_total, accepted_attachment_bytes_total,
      last_alert_at, updated_at
    )
    select new.transferred_to_account_id, source.accepted_alerts_total,
      source.accepted_attachment_bytes_total, source.last_alert_at, pg_catalog.now()
    from private.account_usage_counters as source where source.account_id = new.id
    on conflict (account_id) do update set
      accepted_alerts_total = private.account_usage_counters.accepted_alerts_total
        + excluded.accepted_alerts_total,
      accepted_attachment_bytes_total = private.account_usage_counters.accepted_attachment_bytes_total
        + excluded.accepted_attachment_bytes_total,
      last_alert_at = greatest(private.account_usage_counters.last_alert_at, excluded.last_alert_at),
      updated_at = pg_catalog.now();

    insert into private.account_usage_daily (
      account_id, usage_date, accepted_alerts, accepted_attachments,
      accepted_attachment_bytes, updated_at
    )
    select new.transferred_to_account_id, source.usage_date, source.accepted_alerts,
      source.accepted_attachments, source.accepted_attachment_bytes, pg_catalog.now()
    from private.account_usage_daily as source where source.account_id = new.id
    on conflict (account_id, usage_date) do update set
      accepted_alerts = private.account_usage_daily.accepted_alerts + excluded.accepted_alerts,
      accepted_attachments = private.account_usage_daily.accepted_attachments + excluded.accepted_attachments,
      accepted_attachment_bytes = private.account_usage_daily.accepted_attachment_bytes
        + excluded.accepted_attachment_bytes,
      updated_at = pg_catalog.now();
    delete from private.account_usage_daily where account_id = new.id;
    delete from private.account_usage_counters where account_id = new.id;
  end if;
  if old.status is distinct from new.status and new.status = 'deleted' then
    delete from private.account_usage_daily where account_id = new.id;
    delete from private.account_usage_counters where account_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.purge_deleted_account_usage() from public, anon, authenticated;
create trigger accounts_purge_usage_on_delete
after update of status on private.accounts
for each row execute function private.purge_deleted_account_usage();

revoke all on function public.get_notification_push_queue_count_internal(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.claim_push_delivery_jobs_internal(uuid, integer)
from public, anon, authenticated;
revoke all on function public.accept_push_delivery_ticket_internal(uuid, uuid, text, integer)
from public, anon, authenticated;
revoke all on function public.fail_push_delivery_job_internal(uuid, uuid, text, boolean, integer)
from public, anon, authenticated;
revoke all on function public.claim_push_receipt_jobs_internal(uuid, integer)
from public, anon, authenticated;
revoke all on function public.complete_push_delivery_job_internal(uuid, uuid, text, text, integer)
from public, anon, authenticated;
revoke all on function public.defer_push_receipt_internal(uuid, uuid, text, integer)
from public, anon, authenticated;
revoke all on function public.retry_push_delivery_from_receipt_internal(uuid, uuid, text, integer)
from public, anon, authenticated;
revoke all on function public.get_account_usage() from public, anon, authenticated;

grant execute on function public.get_notification_push_queue_count_internal(uuid, uuid) to service_role;
grant execute on function public.claim_push_delivery_jobs_internal(uuid, integer) to service_role;
grant execute on function public.accept_push_delivery_ticket_internal(uuid, uuid, text, integer) to service_role;
grant execute on function public.fail_push_delivery_job_internal(uuid, uuid, text, boolean, integer) to service_role;
grant execute on function public.claim_push_receipt_jobs_internal(uuid, integer) to service_role;
grant execute on function public.complete_push_delivery_job_internal(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.defer_push_receipt_internal(uuid, uuid, text, integer) to service_role;
grant execute on function public.retry_push_delivery_from_receipt_internal(uuid, uuid, text, integer) to service_role;
grant execute on function public.get_account_usage() to authenticated;

create or replace function public.configure_v0_0_8_workers_internal(
  p_project_url text,
  p_push_worker_secret text,
  p_cleanup_secret text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_push_job_id bigint;
  v_cleanup_job_id bigint;
begin
  if p_project_url is null
    or pg_catalog.btrim(p_project_url) !~ '^https://[a-z0-9]+\.supabase\.co$'
    or p_push_worker_secret is null or char_length(p_push_worker_secret) not between 32 and 200
    or p_cleanup_secret is null or char_length(p_cleanup_secret) not between 32 and 200 then
    raise exception 'INVALID_WORKER_CONFIGURATION';
  end if;

  select secret.id into v_secret_id from vault.secrets as secret where secret.name = 'zona_project_url';
  if v_secret_id is null then
    perform vault.create_secret(pg_catalog.btrim(p_project_url), 'zona_project_url', 'Zona Edge Function base URL');
  else
    perform vault.update_secret(v_secret_id, pg_catalog.btrim(p_project_url), 'zona_project_url', 'Zona Edge Function base URL');
  end if;
  select secret.id into v_secret_id from vault.secrets as secret where secret.name = 'zona_push_worker_secret';
  if v_secret_id is null then
    perform vault.create_secret(p_push_worker_secret, 'zona_push_worker_secret', 'Zona push worker credential');
  else
    perform vault.update_secret(v_secret_id, p_push_worker_secret, 'zona_push_worker_secret', 'Zona push worker credential');
  end if;
  select secret.id into v_secret_id from vault.secrets as secret where secret.name = 'zona_cleanup_secret';
  if v_secret_id is null then
    perform vault.create_secret(p_cleanup_secret, 'zona_cleanup_secret', 'Zona cleanup worker credential');
  else
    perform vault.update_secret(v_secret_id, p_cleanup_secret, 'zona_cleanup_secret', 'Zona cleanup worker credential');
  end if;

  perform cron.unschedule(job.jobid) from cron.job as job
  where job.jobname in ('zona-push-delivery-worker', 'zona-cleanup-expired-attachments');
  select cron.schedule(
    'zona-push-delivery-worker', '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'zona_project_url') || '/functions/v1/push-delivery-worker',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zona_push_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    $job$
  ) into v_push_job_id;
  select cron.schedule(
    'zona-cleanup-expired-attachments', '23 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'zona_project_url') || '/functions/v1/cleanup-expired',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zona_cleanup_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    $job$
  ) into v_cleanup_job_id;
  return pg_catalog.jsonb_build_object(
    'pushWorkerJobId', v_push_job_id,
    'cleanupJobId', v_cleanup_job_id
  );
end;
$$;

revoke all on function public.configure_v0_0_8_workers_internal(text, text, text)
from public, anon, authenticated;
grant execute on function public.configure_v0_0_8_workers_internal(text, text, text)
to service_role;
