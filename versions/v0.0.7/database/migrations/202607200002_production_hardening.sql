-- Production hardening is intentionally a forward migration. Do not fold these
-- changes into 202607200001_initial.sql after that migration has been applied.

alter table public.notifications
  add column idempotency_key text,
  add column request_hash text;

alter table public.notifications
  add constraint notifications_idempotency_pair_check check (
    (idempotency_key is null and request_hash is null)
    or (
      idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      and request_hash ~ '^[0-9a-f]{64}$'
    )
  ) not valid;

alter table public.notifications
  validate constraint notifications_idempotency_pair_check;

create unique index notifications_source_idempotency_idx
  on public.notifications(source_id, idempotency_key)
  where idempotency_key is not null;

create index notifications_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

alter table public.sources
  add constraint sources_id_user_id_key unique (id, user_id);

alter table public.notifications
  add constraint notifications_source_owner_fkey
  foreign key (source_id, user_id)
  references public.sources(id, user_id)
  on delete restrict
  not valid;

alter table public.notifications
  validate constraint notifications_source_owner_fkey;

alter table private.ingest_requests
  add column user_id uuid;

update private.ingest_requests as request
set user_id = source.user_id
from public.sources as source
where source.id = request.source_id;

alter table private.ingest_requests
  alter column user_id set not null,
  add constraint ingest_requests_source_owner_fkey
  foreign key (source_id, user_id)
  references public.sources(id, user_id)
  on delete cascade
  not valid;

alter table private.ingest_requests
  validate constraint ingest_requests_source_owner_fkey;

create index ingest_requests_user_rate_idx
  on private.ingest_requests(user_id, requested_at desc);

create table private.account_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('create_source', 'register_push_device')),
  requested_at timestamptz not null default now()
);

create index account_rate_events_lookup_idx
  on private.account_rate_events(user_id, event_type, requested_at desc);

alter table public.push_devices
  add column disabled_at timestamptz;

alter table public.push_devices
  add constraint push_devices_token_format_check check (
    char_length(expo_push_token) between 20 and 255
    and expo_push_token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
  ) not valid;

alter table public.push_devices
  validate constraint push_devices_token_format_check;

create or replace function public.create_source_internal(
  p_user_id uuid,
  p_display_name text,
  p_hostname text,
  p_token_hash text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_active_sources integer;
  v_recent_creates integer;
begin
  if p_user_id is null
    or p_display_name is null
    or char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or (p_hostname is not null and char_length(pg_catalog.btrim(p_hostname)) not between 1 and 255)
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_SOURCE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:sources-user:' || p_user_id::text, 0)
  );

  select count(*) into v_active_sources
  from public.sources as source
  where source.user_id = p_user_id
    and source.revoked_at is null;

  if v_active_sources >= 100 then
    raise exception 'SOURCE_LIMIT_REACHED';
  end if;

  select count(*) into v_recent_creates
  from private.account_rate_events as event
  where event.user_id = p_user_id
    and event.event_type = 'create_source'
    and event.requested_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_creates >= 10 then
    raise exception 'CREATE_RATE_LIMITED';
  end if;

  insert into public.sources (user_id, display_name, hostname)
  values (
    p_user_id,
    pg_catalog.btrim(p_display_name),
    nullif(pg_catalog.btrim(p_hostname), '')
  )
  returning id into v_source_id;

  insert into private.source_credentials (source_id, token_hash)
  values (v_source_id, p_token_hash);

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'create_source');

  return v_source_id;
end;
$$;

create or replace function public.ingest_notification_internal(
  p_token_hash text,
  p_idempotency_key text,
  p_title text,
  p_body text,
  p_category text,
  p_data jsonb
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_source public.sources%rowtype;
  v_source_request_count integer;
  v_user_request_count integer;
  v_notification public.notifications%rowtype;
  v_request_hash text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  if p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_title is null
    or p_body is null
    or char_length(pg_catalog.btrim(p_title)) not between 1 and 120
    or char_length(pg_catalog.btrim(p_body)) not between 1 and 2000
    or (p_category is not null and char_length(pg_catalog.btrim(p_category)) not between 1 and 80)
    or p_data is null
    or pg_catalog.jsonb_typeof(p_data) <> 'object'
    or pg_catalog.octet_length(p_data::text) > 4096 then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select credential.source_id into v_source_id
  from private.source_credentials as credential
  where credential.token_hash = p_token_hash;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  -- Ingest and source management take the same lock. Once a revoke request
  -- returns, no request can continue from a stale pre-revocation read.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || v_source_id::text, 0)
  );

  select source.* into v_source
  from public.sources as source
  where source.id = v_source_id
    and source.revoked_at is null
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'title', pg_catalog.btrim(p_title),
          'body', pg_catalog.btrim(p_body),
          'category', nullif(pg_catalog.btrim(p_category), ''),
          'data', p_data
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select notification.* into v_notification
  from public.notifications as notification
  where notification.source_id = v_source.id
    and notification.idempotency_key = p_idempotency_key;

  if found then
    if v_notification.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;

    return query select
      v_notification.id,
      v_source.id,
      v_notification.source_name_snapshot,
      v_source.user_id,
      v_notification.created_at,
      true;
    return;
  end if;

  -- Different sources for the same account share this lock, preventing the
  -- aggregate rolling-window check from being overrun by concurrent sources.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:ingest-user:' || v_source.user_id::text, 0)
  );

  select count(*) into v_source_request_count
  from private.ingest_requests as request
  where request.source_id = v_source.id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';

  if v_source_request_count >= 60 then
    raise exception 'RATE_LIMITED';
  end if;

  select count(*) into v_user_request_count
  from private.ingest_requests as request
  where request.user_id = v_source.user_id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';

  if v_user_request_count >= 300 then
    raise exception 'ACCOUNT_RATE_LIMITED';
  end if;

  insert into private.ingest_requests (source_id, user_id)
  values (v_source.id, v_source.user_id);

  update public.sources
  set last_seen_at = pg_catalog.now()
  where id = v_source.id;

  insert into public.notifications (
    user_id,
    source_id,
    source_name_snapshot,
    title,
    body,
    category,
    data,
    idempotency_key,
    request_hash
  ) values (
    v_source.user_id,
    v_source.id,
    v_source.display_name,
    pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_body),
    nullif(pg_catalog.btrim(p_category), ''),
    p_data,
    p_idempotency_key,
    v_request_hash
  )
  returning * into v_notification;

  return query select
    v_notification.id,
    v_source.id,
    v_source.display_name,
    v_source.user_id,
    v_notification.created_at,
    false;
end;
$$;

drop function public.ingest_notification_internal(text, text, text, text, jsonb);

create or replace function public.manage_source_internal(
  p_user_id uuid,
  p_source_id uuid,
  p_action text,
  p_display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.sources%rowtype;
begin
  if p_user_id is null or p_source_id is null then
    raise exception 'INVALID_SOURCE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || p_source_id::text, 0)
  );

  select source.* into v_source
  from public.sources as source
  where source.id = p_source_id
    and source.user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  if p_action = 'rename' then
    if v_source.revoked_at is not null then
      return null;
    end if;
    if p_display_name is null
      or char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80 then
      raise exception 'INVALID_SOURCE';
    end if;

    update public.sources
    set display_name = pg_catalog.btrim(p_display_name)
    where id = p_source_id
    returning * into v_source;
  elsif p_action = 'revoke' then
    if v_source.revoked_at is null then
      update public.sources
      set revoked_at = pg_catalog.now()
      where id = p_source_id
      returning * into v_source;
    end if;
  else
    raise exception 'INVALID_ACTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_source.id,
    'displayName', v_source.display_name,
    'revokedAt', v_source.revoked_at
  );
end;
$$;

create or replace function public.register_push_device_internal(
  p_user_id uuid,
  p_device_id text,
  p_expo_push_token text,
  p_platform text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.push_devices%rowtype;
  v_token_device public.push_devices%rowtype;
  v_has_device boolean;
  v_has_token boolean;
  v_active_devices integer;
  v_recent_registrations integer;
begin
  if p_user_id is null
    or p_device_id is null
    or p_expo_push_token is null
    or p_platform is null
    or char_length(pg_catalog.btrim(p_device_id)) not between 8 and 200
    or char_length(pg_catalog.btrim(p_expo_push_token)) not between 20 and 255
    or pg_catalog.btrim(p_expo_push_token) !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
    or p_platform <> 'ios' then
    raise exception 'INVALID_DEVICE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:push-token:' || pg_catalog.btrim(p_expo_push_token), 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:push-user:' || p_user_id::text, 0)
  );

  select device.* into v_device
  from public.push_devices as device
  where device.user_id = p_user_id
    and device.device_id = pg_catalog.btrim(p_device_id)
  for update;
  v_has_device := found;

  select device.* into v_token_device
  from public.push_devices as device
  where device.expo_push_token = pg_catalog.btrim(p_expo_push_token)
  for update;
  v_has_token := found;

  if v_has_token and v_token_device.user_id <> p_user_id then
    raise exception 'TOKEN_CONFLICT';
  end if;

  if v_has_device
    and v_device.expo_push_token = pg_catalog.btrim(p_expo_push_token)
    and v_device.disabled_at is null then
    update public.push_devices
    set updated_at = pg_catalog.now()
    where id = v_device.id;
    return v_device.id;
  end if;

  select count(*) into v_recent_registrations
  from private.account_rate_events as event
  where event.user_id = p_user_id
    and event.event_type = 'register_push_device'
    and event.requested_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_registrations >= 120 then
    raise exception 'DEVICE_RATE_LIMITED';
  end if;

  if not v_has_device or v_device.disabled_at is not null then
    select count(*) into v_active_devices
    from public.push_devices as device
    where device.user_id = p_user_id
      and device.disabled_at is null;

    if v_active_devices >= 10
      and not (v_has_token and v_token_device.user_id = p_user_id and v_token_device.device_id <> pg_catalog.btrim(p_device_id)) then
      raise exception 'DEVICE_LIMIT_REACHED';
    end if;
  end if;

  if v_has_token and v_token_device.device_id <> pg_catalog.btrim(p_device_id) then
    delete from public.push_devices
    where id = v_token_device.id;
  end if;

  if v_has_device then
    update public.push_devices
    set expo_push_token = pg_catalog.btrim(p_expo_push_token),
        platform = 'ios',
        updated_at = pg_catalog.now(),
        disabled_at = null
    where id = v_device.id
    returning * into v_device;
  else
    insert into public.push_devices (
      user_id,
      device_id,
      expo_push_token,
      platform,
      disabled_at
    ) values (
      p_user_id,
      pg_catalog.btrim(p_device_id),
      pg_catalog.btrim(p_expo_push_token),
      'ios',
      null
    )
    returning * into v_device;
  end if;

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'register_push_device');

  return v_device.id;
end;
$$;

create or replace function public.unregister_push_device_internal(
  p_user_id uuid,
  p_device_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_id uuid;
begin
  if p_user_id is null
    or p_device_id is null
    or char_length(pg_catalog.btrim(p_device_id)) not between 8 and 200 then
    raise exception 'INVALID_DEVICE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:push-user:' || p_user_id::text, 0)
  );

  delete from public.push_devices
  where user_id = p_user_id
    and device_id = pg_catalog.btrim(p_device_id)
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;

create or replace function public.record_push_delivery_internal(
  p_notification_id uuid,
  p_push_device_id uuid,
  p_http_status integer,
  p_response jsonb,
  p_error_message text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.notifications as notification
    where notification.id = p_notification_id
  ) then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  if p_push_device_id is not null and not exists (
    select 1
    from public.notifications as notification
    join public.push_devices as device
      on device.id = p_push_device_id
     and device.user_id = notification.user_id
    where notification.id = p_notification_id
  ) then
    raise exception 'DEVICE_OWNER_MISMATCH';
  end if;

  insert into private.push_delivery_logs (
    notification_id,
    push_device_id,
    http_status,
    response,
    error_message
  ) values (
    p_notification_id,
    p_push_device_id,
    p_http_status,
    p_response,
    pg_catalog.left(p_error_message, 500)
  );
end;
$$;

create or replace function public.delete_account_data_internal(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifications integer;
  v_devices integer;
  v_sources integer;
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;

  delete from public.notifications where user_id = p_user_id;
  get diagnostics v_notifications = row_count;

  delete from public.push_devices where user_id = p_user_id;
  get diagnostics v_devices = row_count;

  delete from public.sources where user_id = p_user_id;
  get diagnostics v_sources = row_count;

  delete from private.account_rate_events where user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'notifications', v_notifications,
    'pushDevices', v_devices,
    'sources', v_sources
  );
end;
$$;

create or replace function private.cleanup_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifications integer;
  v_ingest_requests integer;
  v_rate_events integer;
  v_push_devices integer;
  v_sources integer;
  v_cron_history integer;
begin
  delete from public.notifications
  where expires_at <= pg_catalog.now();
  get diagnostics v_notifications = row_count;

  delete from private.ingest_requests
  where requested_at < pg_catalog.now() - interval '1 day';
  get diagnostics v_ingest_requests = row_count;

  delete from private.account_rate_events
  where requested_at < pg_catalog.now() - interval '2 days';
  get diagnostics v_rate_events = row_count;

  delete from public.push_devices
  where disabled_at < pg_catalog.now() - interval '7 days';
  get diagnostics v_push_devices = row_count;

  delete from public.sources as source
  where source.revoked_at < pg_catalog.now() - interval '30 days'
    and not exists (
      select 1
      from public.notifications as notification
      where notification.source_id = source.id
    );
  get diagnostics v_sources = row_count;

  delete from cron.job_run_details
  where coalesce(end_time, start_time) < pg_catalog.now() - interval '30 days';
  get diagnostics v_cron_history = row_count;

  return pg_catalog.jsonb_build_object(
    'notifications', v_notifications,
    'ingestRequests', v_ingest_requests,
    'rateEvents', v_rate_events,
    'pushDevices', v_push_devices,
    'sources', v_sources,
    'cronHistory', v_cron_history
  );
end;
$$;

revoke all on function public.create_source_internal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ingest_notification_internal(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.manage_source_internal(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.register_push_device_internal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.unregister_push_device_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.record_push_delivery_internal(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.delete_account_data_internal(uuid) from public, anon, authenticated;
revoke all on function private.cleanup_expired_data() from public, anon, authenticated;

grant execute on function public.create_source_internal(uuid, text, text, text) to service_role;
grant execute on function public.ingest_notification_internal(text, text, text, text, text, jsonb) to service_role;
grant execute on function public.manage_source_internal(uuid, uuid, text, text) to service_role;
grant execute on function public.register_push_device_internal(uuid, text, text, text) to service_role;
grant execute on function public.unregister_push_device_internal(uuid, text) to service_role;
grant execute on function public.record_push_delivery_internal(uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.delete_account_data_internal(uuid) to service_role;

select cron.schedule(
  'zona-delete-expired-data',
  '17 * * * *',
  $cron$select private.cleanup_expired_data();$cron$
);
