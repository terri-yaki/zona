-- Zona v0.0.6 runtime-control foundation.
--
-- The installed v0.0.5 client still queries the original public relation
-- names directly. Most canonical v0.0.6 names are therefore introduced as
-- security-invoker views first; a post-adoption migration can replace each
-- view with the renamed base table without another mobile code change.
-- Release notes are read-only, so they can be normalized and renamed now
-- while a compatible app_changelog view keeps older clients working.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Canonical relation names used by v0.0.6. These remain views during the
-- compatibility window because old clients depend on the original tables.
-- -------------------------------------------------------------------------

create view public.notification_sources
with (security_invoker = true)
as select * from public.sources;

create view public.source_access_keys
with (security_invoker = true)
as select * from public.api_keys;

create view public.inbox_notifications
with (security_invoker = true)
as select * from public.notifications;

create view public.push_registrations
with (security_invoker = true)
as select * from public.push_devices;

create view public.user_notification_preferences
with (security_invoker = true)
as select * from public.app_options;

create view public.notification_source_overview
with (security_invoker = true)
as
select
  source.id,
  source.user_id,
  source.display_name,
  source.hostname,
  source.created_at,
  source.last_seen_at,
  source.revoked_at,
  api_key.id as access_key_id,
  api_key.name as access_key_name,
  api_key.key_prefix,
  api_key.is_active,
  api_key.created_at as access_key_created_at,
  api_key.updated_at as access_key_updated_at,
  api_key.last_used_at as access_key_last_used_at,
  api_key.expires_at as access_key_expires_at,
  api_key.revoked_at as access_key_revoked_at,
  api_key.sound_name
from public.sources as source
join public.api_keys as api_key
  on api_key.source_id = source.id
 and api_key.user_id = source.user_id;

revoke all on public.notification_sources from anon, authenticated;
revoke all on public.source_access_keys from anon, authenticated;
revoke all on public.inbox_notifications from anon, authenticated;
revoke all on public.push_registrations from anon, authenticated;
revoke all on public.user_notification_preferences from anon, authenticated;
revoke all on public.notification_source_overview from anon, authenticated;

grant select on public.notification_sources to authenticated;
grant select on public.source_access_keys to authenticated;
grant select on public.inbox_notifications to authenticated;
grant select on public.user_notification_preferences to authenticated;
grant select on public.notification_source_overview to authenticated;
grant all on public.notification_sources to service_role;
grant all on public.source_access_keys to service_role;
grant all on public.inbox_notifications to service_role;
grant all on public.push_registrations to service_role;
grant all on public.user_notification_preferences to service_role;
grant select on public.notification_source_overview to service_role;

-- Private canonical aliases document the final names without exposing service
-- data through the API. Database functions continue using the old base names
-- until the compatibility window closes.
create view private.source_api_credentials
with (security_invoker = true) as select * from private.source_credentials;
create view private.notification_ingest_requests
with (security_invoker = true) as select * from private.ingest_requests;
create view private.push_delivery_attempts
with (security_invoker = true) as select * from private.push_delivery_logs;
create view private.account_rate_limit_events
with (security_invoker = true) as select * from private.account_rate_events;

revoke all on private.source_api_credentials from public, anon, authenticated;
revoke all on private.notification_ingest_requests from public, anon, authenticated;
revoke all on private.push_delivery_attempts from public, anon, authenticated;
revoke all on private.account_rate_limit_events from public, anon, authenticated;

create index push_delivery_attempts_notification_idx
on private.push_delivery_logs (notification_id);

create index push_delivery_attempts_registration_idx
on private.push_delivery_logs (push_device_id)
where push_device_id is not null;

create index notification_ingest_rate_events_source_owner_idx
on private.ingest_requests (source_id, user_id, requested_at desc);

create index inbox_notifications_source_owner_idx
on public.notifications (source_id, user_id);

-- -------------------------------------------------------------------------
-- Split server-owned subscription state from user-writable preferences.
-- Legacy premium columns remain temporarily so v0.0.5 keeps working.
-- -------------------------------------------------------------------------

create table private.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'standard'
    check (plan_code in ('standard', 'premium')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'grace', 'expired', 'revoked')),
  store text,
  product_id text,
  customer_id text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or starts_at < expires_at)
);

insert into private.account_entitlements (
  user_id,
  plan_code,
  status,
  store,
  product_id,
  customer_id,
  expires_at,
  created_at,
  updated_at
)
select
  options.user_id,
  case when options.is_premium then 'premium' else 'standard' end,
  case
    when options.premium_status in ('active', 'trialing', 'grace', 'expired', 'revoked')
      then options.premium_status
    when options.is_premium then 'active'
    else 'expired'
  end,
  options.premium_store,
  options.premium_product_id,
  options.premium_customer_id,
  options.premium_expires_at,
  options.created_at,
  options.updated_at
from public.app_options as options
on conflict (user_id) do nothing;

create trigger account_entitlements_set_updated_at
before update on private.account_entitlements
for each row execute function private.set_updated_at();

revoke all on private.account_entitlements from public, anon, authenticated;

create or replace function private.user_is_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select entitlement.plan_code = 'premium'
      and entitlement.status in ('active', 'trialing', 'grace')
      and (entitlement.starts_at is null or entitlement.starts_at <= pg_catalog.now())
      and (entitlement.expires_at is null or entitlement.expires_at > pg_catalog.now())
    from private.account_entitlements as entitlement
    where entitlement.user_id = p_user_id
  ), false);
$$;

revoke all on function private.user_is_premium(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Typed service limits and kill switches. These are enforced by trusted
-- backend code; hiding a client button never substitutes for authorization.
-- -------------------------------------------------------------------------

create table private.service_plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null check (plan_code in ('standard', 'premium')),
  max_source_keys integer not null check (max_source_keys between 1 and 100000),
  retention_days integer not null check (retention_days between 1 and 365),
  account_notify_rpm integer not null check (account_notify_rpm between 1 and 100000),
  -- v0.0.5's hardened ingest function retains a 60/minute ceiling. The typed
  -- value can lower that ceiling immediately and may be widened after cutover.
  source_notify_rpm integer not null check (source_notify_rpm between 1 and 60),
  max_attachment_bytes integer not null check (max_attachment_bytes between 1024 and 52428800),
  max_push_devices integer not null default 10 check (max_push_devices between 1 and 1000),
  is_active boolean not null default true,
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or starts_at < expires_at)
);

create index service_plan_limits_lookup_idx
on private.service_plan_limits (plan_code, is_active, priority desc, updated_at desc);

create table private.service_switches (
  id uuid primary key default gen_random_uuid(),
  switch_key text not null check (switch_key ~ '^[a-z][a-z0-9_.]+$'),
  is_enabled boolean not null default true,
  is_active boolean not null default true,
  operator_reason text,
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or starts_at < expires_at)
);

create index service_switches_lookup_idx
on private.service_switches (switch_key, is_active, priority desc, updated_at desc);

create trigger service_plan_limits_set_updated_at
before update on private.service_plan_limits
for each row execute function private.set_updated_at();

create trigger service_switches_set_updated_at
before update on private.service_switches
for each row execute function private.set_updated_at();

revoke all on private.service_plan_limits from public, anon, authenticated;
revoke all on private.service_switches from public, anon, authenticated;

with current_values as (
  select
    max(value) filter (where option_name = 'max_api_keys_standard') as max_keys_standard,
    max(value) filter (where option_name = 'max_api_keys_premium') as max_keys_premium,
    max(value) filter (where option_name = 'retention_days_standard') as retention_standard,
    max(value) filter (where option_name = 'retention_days_premium') as retention_premium,
    max(value) filter (where option_name = 'notify_rpm_standard') as notify_standard,
    max(value) filter (where option_name = 'notify_rpm_premium') as notify_premium,
    max(value) filter (where option_name = 'attachment_max_bytes_standard') as attachment_standard,
    max(value) filter (where option_name = 'attachment_max_bytes_premium') as attachment_premium
  from public.universal_app_options
), validated as (
  select
    case when max_keys_standard ~ '^[0-9]{1,6}$' and max_keys_standard::integer between 1 and 100000 then max_keys_standard::integer else 3 end as max_keys_standard,
    case when max_keys_premium ~ '^[0-9]{1,6}$' and max_keys_premium::integer between 1 and 100000 then max_keys_premium::integer else 10 end as max_keys_premium,
    case when retention_standard ~ '^[0-9]{1,3}$' and retention_standard::integer between 1 and 365 then retention_standard::integer else 7 end as retention_standard,
    case when retention_premium ~ '^[0-9]{1,3}$' and retention_premium::integer between 1 and 365 then retention_premium::integer else 30 end as retention_premium,
    case when notify_standard ~ '^[0-9]{1,6}$' and notify_standard::integer between 1 and 100000 then notify_standard::integer else 20 end as notify_standard,
    case when notify_premium ~ '^[0-9]{1,6}$' and notify_premium::integer between 1 and 100000 then notify_premium::integer else 60 end as notify_premium,
    case when attachment_standard ~ '^[0-9]{4,8}$' and attachment_standard::integer between 1024 and 52428800 then attachment_standard::integer else 5242880 end as attachment_standard,
    case when attachment_premium ~ '^[0-9]{4,8}$' and attachment_premium::integer between 1024 and 52428800 then attachment_premium::integer else 20971520 end as attachment_premium
  from current_values
)
insert into private.service_plan_limits (
  plan_code,
  max_source_keys,
  retention_days,
  account_notify_rpm,
  source_notify_rpm,
  max_attachment_bytes,
  max_push_devices
)
select 'standard', max_keys_standard, retention_standard, notify_standard, 60, attachment_standard, 10
from validated
union all
select 'premium', max_keys_premium, retention_premium, notify_premium, 60, attachment_premium, 25
from validated;

insert into private.service_switches (switch_key, is_enabled, operator_reason)
values
  ('api.v1.notifications.accept', true, 'Accept v1 notification ingestion'),
  ('sources.create', true, 'Allow new source access keys'),
  ('sources.test', true, 'Allow test notifications'),
  ('push.deliver', true, 'Attempt Expo push delivery'),
  ('notifications.attachments', true, 'Accept image attachments'),
  ('notifications.critical_severity', true, 'Accept critical severity');

create or replace function private.service_switch_enabled(
  p_switch_key text,
  p_fallback boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select switch.is_enabled
    from private.service_switches as switch
    where switch.switch_key = p_switch_key
      and switch.is_active
      and (switch.starts_at is null or switch.starts_at <= pg_catalog.now())
      and (switch.expires_at is null or switch.expires_at > pg_catalog.now())
    order by switch.priority desc, switch.updated_at desc, switch.id desc
    limit 1
  ), p_fallback);
$$;

create or replace function private.effective_plan_code(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.user_is_premium(p_user_id) then 'premium' else 'standard' end;
$$;

create or replace function private.effective_limit(p_user_id uuid, p_limit text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limits private.service_plan_limits%rowtype;
begin
  if p_limit not in (
    'max_api_keys',
    'retention_days',
    'notify_rpm',
    'source_notify_rpm',
    'attachment_max_bytes',
    'max_push_devices'
  ) then
    raise exception 'INVALID_LIMIT_KEY';
  end if;

  select limits.* into v_limits
  from private.service_plan_limits as limits
  where limits.plan_code = private.effective_plan_code(p_user_id)
    and limits.is_active
    and (limits.starts_at is null or limits.starts_at <= pg_catalog.now())
    and (limits.expires_at is null or limits.expires_at > pg_catalog.now())
  order by limits.priority desc, limits.updated_at desc, limits.id desc
  limit 1;

  if not found then
    return case p_limit
      when 'max_api_keys' then 3
      when 'retention_days' then 7
      when 'notify_rpm' then 20
      when 'source_notify_rpm' then 60
      when 'attachment_max_bytes' then 5242880
      when 'max_push_devices' then 10
    end;
  end if;

  return case p_limit
    when 'max_api_keys' then v_limits.max_source_keys
    when 'retention_days' then v_limits.retention_days
    when 'notify_rpm' then v_limits.account_notify_rpm
    when 'source_notify_rpm' then v_limits.source_notify_rpm
    when 'attachment_max_bytes' then v_limits.max_attachment_bytes
    when 'max_push_devices' then v_limits.max_push_devices
  end;
end;
$$;

create or replace function public.service_switch_enabled_internal(p_switch_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.service_switch_enabled(p_switch_key, false);
$$;

create or replace function public.notification_ingest_policy_internal(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select source.user_id into v_owner
  from private.source_credentials as credential
  join public.sources as source on source.id = credential.source_id
  join public.api_keys as access_key on access_key.source_id = source.id
  where credential.token_hash = p_token_hash
    and source.revoked_at is null
    and access_key.is_active
    and access_key.revoked_at is null
    and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now());

  return pg_catalog.jsonb_build_object(
    'acceptNotifications', private.service_switch_enabled('api.v1.notifications.accept', false),
    'allowAttachments', private.service_switch_enabled('notifications.attachments', false),
    'allowCriticalSeverity', private.service_switch_enabled('notifications.critical_severity', false),
    'deliverPush', private.service_switch_enabled('push.deliver', false),
    'attachmentMaxBytes', private.effective_limit(v_owner, 'attachment_max_bytes'),
    'maxPushDevices', private.effective_limit(v_owner, 'max_push_devices')
  );
end;
$$;

create or replace function public.notification_delivery_policy_internal(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'deliverPush', private.service_switch_enabled('push.deliver', false),
    'maxPushDevices', private.effective_limit(p_user_id, 'max_push_devices')
  );
$$;

revoke all on function private.service_switch_enabled(text, boolean) from public, anon, authenticated;
revoke all on function private.effective_plan_code(uuid) from public, anon, authenticated;
revoke all on function private.effective_limit(uuid, text) from public, anon, authenticated;
revoke all on function public.service_switch_enabled_internal(text) from public, anon, authenticated;
revoke all on function public.notification_ingest_policy_internal(text) from public, anon, authenticated;
revoke all on function public.notification_delivery_policy_internal(uuid) from public, anon, authenticated;
grant execute on function public.service_switch_enabled_internal(text) to service_role;
grant execute on function public.notification_ingest_policy_internal(text) to service_role;
grant execute on function public.notification_delivery_policy_internal(uuid) to service_role;

-- Put kill switches in front of the existing, already-hardened database
-- functions. The renamed implementations retain their validation, locking,
-- ownership, idempotency, and cleanup behavior.
alter function public.create_source_internal(uuid, text, text, text, text)
  rename to create_source_uncontrolled_internal;

create function public.create_source_internal(
  p_user_id uuid,
  p_display_name text,
  p_hostname text,
  p_token_hash text,
  p_key_prefix text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.service_switch_enabled('sources.create', false) then
    raise exception 'SOURCE_CREATION_DISABLED';
  end if;
  return public.create_source_uncontrolled_internal(
    p_user_id,
    p_display_name,
    p_hostname,
    p_token_hash,
    p_key_prefix
  );
end;
$$;

alter function public.create_test_notification_internal(uuid, uuid)
  rename to create_test_notification_uncontrolled_internal;

create function public.create_test_notification_internal(
  p_user_id uuid,
  p_source_id uuid
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz,
  sound_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.service_switch_enabled('sources.test', false) then
    raise exception 'TEST_NOTIFICATIONS_DISABLED';
  end if;
  return query
  select * from public.create_test_notification_uncontrolled_internal(p_user_id, p_source_id);
end;
$$;

alter function public.ingest_notification_internal(text, text, text, text, text, jsonb, text)
  rename to ingest_notification_uncontrolled_internal;

create function public.ingest_notification_internal(
  p_token_hash text,
  p_idempotency_key text,
  p_title text,
  p_body text,
  p_category text,
  p_data jsonb,
  p_attachment_hash text default null
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz,
  idempotent_replay boolean,
  attachment_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_owner uuid;
  v_recent integer;
begin
  select source.id, source.user_id into v_source_id, v_owner
  from private.source_credentials as credential
  join public.sources as source on source.id = credential.source_id
  join public.api_keys as access_key on access_key.source_id = source.id
  where credential.token_hash = p_token_hash
    and source.revoked_at is null
    and access_key.is_active
    and access_key.revoked_at is null
    and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now());

  if not found then
    return query select * from public.ingest_notification_uncontrolled_internal(
      p_token_hash,
      p_idempotency_key,
      p_title,
      p_body,
      p_category,
      p_data,
      p_attachment_hash
    );
    return;
  end if;

  if not private.service_switch_enabled('api.v1.notifications.accept', false) then
    raise exception 'NOTIFICATION_INGESTION_DISABLED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || v_source_id::text, 0)
  );

  -- Replays and conflicts must reach the hardened idempotency check even when
  -- the rolling source window is full. The source lock closes the race with a
  -- concurrent first acceptance of the same key.
  if exists (
    select 1
    from public.notifications as notification
    where notification.source_id = v_source_id
      and notification.idempotency_key = p_idempotency_key
  ) then
    return query select * from public.ingest_notification_uncontrolled_internal(
      p_token_hash,
      p_idempotency_key,
      p_title,
      p_body,
      p_category,
      p_data,
      p_attachment_hash
    );
    return;
  end if;

  select count(*) into v_recent
  from private.ingest_requests as request
  where request.source_id = v_source_id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';

  if v_recent >= private.effective_limit(v_owner, 'source_notify_rpm') then
    raise exception 'RATE_LIMITED';
  end if;

  return query select * from public.ingest_notification_uncontrolled_internal(
    p_token_hash,
    p_idempotency_key,
    p_title,
    p_body,
    p_category,
    p_data,
    p_attachment_hash
  );
end;
$$;

alter function public.ingest_notification_internal(text, text, text, text, text, jsonb, text, text)
  rename to ingest_notification_with_severity_uncontrolled_internal;

create function public.ingest_notification_internal(
  p_token_hash text,
  p_idempotency_key text,
  p_title text,
  p_body text,
  p_category text,
  p_data jsonb,
  p_attachment_hash text,
  p_severity text
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz,
  idempotent_replay boolean,
  attachment_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.lower(pg_catalog.btrim(coalesce(p_severity, ''))) = 'critical'
    and not private.service_switch_enabled('notifications.critical_severity', false) then
    raise exception 'CRITICAL_SEVERITY_DISABLED';
  end if;

  return query select * from public.ingest_notification_with_severity_uncontrolled_internal(
    p_token_hash,
    p_idempotency_key,
    p_title,
    p_body,
    p_category,
    p_data,
    p_attachment_hash,
    p_severity
  );
end;
$$;

alter function public.attach_notification_image_internal(uuid, text, text, integer)
  rename to attach_notification_image_uncontrolled_internal;

create function public.attach_notification_image_internal(
  p_notification_id uuid,
  p_path text,
  p_mime text,
  p_bytes integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.service_switch_enabled('notifications.attachments', false) then
    raise exception 'ATTACHMENTS_DISABLED';
  end if;
  perform public.attach_notification_image_uncontrolled_internal(
    p_notification_id,
    p_path,
    p_mime,
    p_bytes
  );
end;
$$;

revoke all on function public.create_source_uncontrolled_internal(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_test_notification_uncontrolled_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ingest_notification_uncontrolled_internal(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ingest_notification_with_severity_uncontrolled_internal(text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.attach_notification_image_uncontrolled_internal(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.create_source_internal(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_test_notification_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.attach_notification_image_internal(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_source_internal(uuid, text, text, text, text) to service_role;
grant execute on function public.create_test_notification_internal(uuid, uuid) to service_role;
grant execute on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.attach_notification_image_internal(uuid, text, text, integer) to service_role;

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
    or p_platform not in ('ios', 'android') then
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
    and v_device.platform = p_platform
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

    if v_active_devices >= private.effective_limit(p_user_id, 'max_push_devices')
      and not (
        v_has_token
        and v_token_device.user_id = p_user_id
        and v_token_device.device_id <> pg_catalog.btrim(p_device_id)
      ) then
      raise exception 'DEVICE_LIMIT_REACHED';
    end if;
  end if;

  if v_has_token and v_token_device.device_id <> pg_catalog.btrim(p_device_id) then
    delete from public.push_devices where id = v_token_device.id;
  end if;

  if v_has_device then
    update public.push_devices
    set expo_push_token = pg_catalog.btrim(p_expo_push_token),
        platform = p_platform,
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
      p_platform,
      null
    )
    returning * into v_device;
  end if;

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'register_push_device');

  return v_device.id;
end;
$$;

revoke all on function public.register_push_device_internal(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.register_push_device_internal(uuid, text, text, text)
to service_role;

-- -------------------------------------------------------------------------
-- Client-safe controls. Rules are allowlisted by the shipped client and may
-- change presentation only. They cannot relax RLS, ownership, token checks,
-- account deletion, privacy access, or any other authorization boundary.
-- -------------------------------------------------------------------------

create table private.app_feature_controls (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_.]+$'),
  mode text not null default 'enabled'
    check (mode in ('enabled', 'disabled', 'hidden', 'read_only')),
  reason_en text,
  reason_zh_hant text,
  is_active boolean not null default true,
  platform text check (platform in ('ios', 'android', 'web')),
  release_channel text check (release_channel in ('production', 'preview', 'development')),
  locale text check (locale in ('en', 'zh-Hant')),
  account_tier text check (account_tier in ('standard', 'premium')),
  min_build_number integer check (min_build_number is null or min_build_number >= 0),
  max_build_number integer check (max_build_number is null or max_build_number >= 0),
  rollout_basis_points integer not null default 10000
    check (rollout_basis_points between 0 and 10000),
  rollout_seed text not null default 'zona-default',
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or starts_at < expires_at),
  check (max_build_number is null or min_build_number is null or min_build_number <= max_build_number)
);

create index app_feature_controls_lookup_idx
on private.app_feature_controls (feature_key, is_active, priority desc, updated_at desc);

create table private.app_runtime_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null check (setting_key ~ '^[a-z][a-z0-9_.]+$'),
  value_type text not null check (value_type in ('boolean', 'number', 'string', 'json')),
  value jsonb not null,
  description text not null default '',
  is_active boolean not null default true,
  platform text check (platform in ('ios', 'android', 'web')),
  release_channel text check (release_channel in ('production', 'preview', 'development')),
  locale text check (locale in ('en', 'zh-Hant')),
  account_tier text check (account_tier in ('standard', 'premium')),
  min_build_number integer check (min_build_number is null or min_build_number >= 0),
  max_build_number integer check (max_build_number is null or max_build_number >= 0),
  rollout_basis_points integer not null default 10000
    check (rollout_basis_points between 0 and 10000),
  rollout_seed text not null default 'zona-default',
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (value_type = 'boolean' and jsonb_typeof(value) = 'boolean')
    or (value_type = 'number' and jsonb_typeof(value) = 'number')
    or (value_type = 'string' and jsonb_typeof(value) = 'string')
    or value_type = 'json'
  ),
  check (expires_at is null or starts_at is null or starts_at < expires_at),
  check (max_build_number is null or min_build_number is null or min_build_number <= max_build_number)
);

create index app_runtime_settings_lookup_idx
on private.app_runtime_settings (setting_key, is_active, priority desc, updated_at desc);

create trigger app_feature_controls_set_updated_at
before update on private.app_feature_controls
for each row execute function private.set_updated_at();

create trigger app_runtime_settings_set_updated_at
before update on private.app_runtime_settings
for each row execute function private.set_updated_at();

revoke all on private.app_feature_controls from public, anon, authenticated;
revoke all on private.app_runtime_settings from public, anon, authenticated;

insert into private.app_feature_controls (feature_key, mode, platform, reason_en, reason_zh_hant)
values
  ('inbox.filters', 'enabled', null, null, null),
  ('inbox.mark_all_read', 'enabled', null, null, null),
  ('inbox.show_revoked_filters', 'enabled', null, null, null),
  ('notification.attachments', 'enabled', null, null, null),
  ('notification.metadata', 'enabled', null, null, null),
  ('notification.severity', 'enabled', null, null, null),
  ('sources.create', 'enabled', null, null, null),
  ('sources.rename', 'enabled', null, null, null),
  ('sources.pause', 'enabled', null, null, null),
  ('sources.test', 'enabled', null, null, null),
  ('sources.sound', 'enabled', null, null, null),
  ('settings.push', 'enabled', null, null, null),
  ('settings.push_registration', 'enabled', null, null, null),
  ('settings.sound', 'enabled', null, null, null),
  ('settings.preview', 'enabled', null, null, null),
  ('settings.live_activity', 'enabled', 'ios', null, null),
  ('settings.language', 'enabled', null, null, null),
  ('settings.whats_new', 'enabled', null, null, null),
  ('settings.manual_update', 'enabled', null, null, null),
  ('settings.user_guide', 'enabled', null, null, null),
  ('onboarding.push', 'enabled', null, null, null),
  ('background.live_activity', 'enabled', 'ios', null, null),
  ('background.ota_updates', 'enabled', null, null, null),
  ('background.push_registration', 'enabled', null, null, null);

insert into private.app_runtime_settings (setting_key, value_type, value, description)
values
  ('content.user_guide_url', 'string', to_jsonb('https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc'::text), 'User guide URL'),
  ('runtime.refresh_seconds', 'number', '300'::jsonb, 'Bootstrap cache refresh interval'),
  ('inbox.page_size', 'number', '30'::jsonb, 'Inbox page size'),
  ('inbox.time_filter_hours', 'number', '24'::jsonb, 'Quick time filter window'),
  ('sources.online_window_minutes', 'number', '5'::jsonb, 'Online badge activity window');

-- -------------------------------------------------------------------------
-- Release notes and independently controllable changelog items.
-- -------------------------------------------------------------------------

alter table public.app_changelog rename to app_release_notes;
alter table public.app_release_notes rename column items to legacy_items;

alter table public.app_release_notes
  rename constraint app_changelog_pkey to app_release_notes_pkey;
alter table public.app_release_notes
  rename constraint app_changelog_version_key to app_release_notes_version_key;
alter index public.app_changelog_released_idx rename to app_release_notes_released_idx;
alter table public.universal_app_options
  rename constraint universal_app_options_pkey1 to universal_app_options_pkey;

alter table public.app_release_notes
  add column starts_at timestamptz,
  add column expires_at timestamptz,
  add constraint app_release_notes_window_check
    check (expires_at is null or starts_at is null or starts_at < expires_at);

drop policy if exists "Authenticated users read the changelog" on public.app_release_notes;
create policy "Authenticated users read published release notes"
on public.app_release_notes for select to authenticated
using (
  is_active
  and (starts_at is null or starts_at <= (select now()))
  and (expires_at is null or expires_at > (select now()))
);

-- The migration ledger contains the earlier 0.0.6 seed, but the live row was
-- deleted manually. This idempotent upsert restores it and updates the copy to
-- describe the complete release before items are normalized below.
insert into public.app_release_notes (
  version,
  released_at,
  title_en,
  title_zh_hant,
  summary_en,
  summary_zh_hant,
  legacy_items,
  is_active
) values (
  '0.0.6',
  '2026-07-28T08:00:00+00:00',
  'Your app, under control',
  '你的 App，由你掌控',
  'Zona can now change safe app features, limits, release notes, and notices from the server without hiding essential privacy or account controls.',
  'Zona 現在可以從伺服器調整安全的 App 功能、限制、更新內容和公告，同時保留必要的私隱與帳戶控制。',
  '[
    {"key":"runtime-controls","icon":"switch.2","is_active":true,"title_en":"Controls without a rebuild","title_zh_hant":"無需重建也能控制","body_en":"Features can be enabled, disabled, hidden, scheduled, or rolled out gradually by platform and build.","body_zh_hant":"功能可以按平台與版本啟用、停用、隱藏、排程或逐步推出。"},
    {"key":"cleaner-data-model","icon":"tablecells.fill","is_active":true,"title_en":"Names that explain themselves","title_zh_hant":"一看就懂的資料名稱","body_en":"Zona now uses clearer canonical names for sources, access keys, inbox alerts, push registrations, preferences, and release notes.","body_zh_hant":"來源、存取金鑰、收件匣通知、推送註冊、偏好設定與更新內容現在都有更清楚的名稱。"},
    {"key":"item-publishing","icon":"list.bullet.rectangle.fill","is_active":true,"title_en":"Publish one note at a time","title_zh_hant":"逐項發佈更新內容","body_en":"Every What''s New card has its own active switch, order, schedule, and platform target.","body_zh_hant":"每張更新內容卡片都有獨立的啟用開關、順序、排程和平台目標。"},
    {"key":"safer-limits","icon":"shield.lefthalf.filled","is_active":true,"title_en":"Safer server controls","title_zh_hant":"更安全的伺服器控制","body_en":"Typed plan limits and server-side kill switches now protect ingestion, attachments, testing, and push delivery.","body_zh_hant":"具型別的方案限制與伺服器端緊急開關，現在會保護通知接收、附件、測試和推送。"}
  ]'::jsonb,
  true
)
on conflict (version) do update set
  released_at = excluded.released_at,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  summary_en = excluded.summary_en,
  summary_zh_hant = excluded.summary_zh_hant,
  legacy_items = excluded.legacy_items,
  is_active = excluded.is_active,
  updated_at = pg_catalog.now();

create table public.app_release_note_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.app_release_notes(id) on delete cascade,
  item_key text not null,
  icon_name text not null default 'sparkles',
  title_en text not null,
  title_zh_hant text not null default '',
  body_en text not null default '',
  body_zh_hant text not null default '',
  position integer not null default 0 check (position >= 0),
  is_active boolean not null default true,
  platform text check (platform in ('ios', 'android', 'web')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, item_key),
  check (char_length(pg_catalog.btrim(title_en)) between 1 and 120),
  check (expires_at is null or starts_at is null or starts_at < expires_at)
);

insert into public.app_release_note_items (
  release_id,
  item_key,
  icon_name,
  title_en,
  title_zh_hant,
  body_en,
  body_zh_hant,
  position,
  is_active
)
select
  release.id,
  coalesce(nullif(item.value ->> 'key', ''), 'item-' || item.ordinality::text),
  coalesce(nullif(item.value ->> 'icon', ''), 'sparkles'),
  item.value ->> 'title_en',
  coalesce(item.value ->> 'title_zh_hant', ''),
  coalesce(item.value ->> 'body_en', ''),
  coalesce(item.value ->> 'body_zh_hant', ''),
  item.ordinality::integer - 1,
  case pg_catalog.lower(coalesce(item.value ->> 'is_active', 'true'))
    when 'false' then false
    else true
  end
from public.app_release_notes as release
cross join lateral pg_catalog.jsonb_array_elements(release.legacy_items)
  with ordinality as item(value, ordinality)
where pg_catalog.jsonb_typeof(release.legacy_items) = 'array'
  and nullif(pg_catalog.btrim(item.value ->> 'title_en'), '') is not null;

alter table public.app_release_note_items enable row level security;

create policy "Authenticated users read active release note items"
on public.app_release_note_items for select to authenticated
using (
  is_active
  and (starts_at is null or starts_at <= (select now()))
  and (expires_at is null or expires_at > (select now()))
);

create index app_release_note_items_release_idx
on public.app_release_note_items (release_id, position, created_at);

create index app_release_notes_active_released_idx
on public.app_release_notes (released_at desc)
where is_active;

create trigger app_release_notes_set_updated_at
before update on public.app_release_notes
for each row execute function private.set_updated_at();

create trigger app_release_note_items_set_updated_at
before update on public.app_release_note_items
for each row execute function private.set_updated_at();

revoke all on public.app_release_notes from anon, authenticated;
revoke all on public.app_release_note_items from anon, authenticated;
grant select on public.app_release_notes to authenticated;
grant select on public.app_release_note_items to authenticated;
grant all on public.app_release_notes to service_role;
grant all on public.app_release_note_items to service_role;

create view public.app_changelog
with (security_invoker = true)
as
select
  release.id,
  release.version,
  release.released_at,
  release.title_en,
  release.title_zh_hant,
  release.summary_en,
  release.summary_zh_hant,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', item.item_key,
        'icon', item.icon_name,
        'title_en', item.title_en,
        'title_zh_hant', item.title_zh_hant,
        'body_en', item.body_en,
        'body_zh_hant', item.body_zh_hant,
        'is_active', item.is_active
      ) order by item.position, item.created_at
    )
    from public.app_release_note_items as item
    where item.release_id = release.id
  ), '[]'::jsonb) as items,
  release.created_at,
  release.updated_at,
  release.is_active
from public.app_release_notes as release;

revoke all on public.app_changelog from anon, authenticated;
grant select on public.app_changelog to authenticated;

-- The old JSON column is retained only as rollback evidence during v0.0.6.
-- All reads use normalized items; a later cleanup migration can drop it.

-- -------------------------------------------------------------------------
-- Release policy and announcements returned by the bootstrap RPC.
-- -------------------------------------------------------------------------

create table private.client_release_policies (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android', 'web')),
  release_channel text not null check (release_channel in ('production', 'preview', 'development')),
  minimum_build_number integer not null default 0 check (minimum_build_number >= 0),
  recommended_build_number integer not null default 0 check (recommended_build_number >= 0),
  latest_build_number integer not null default 0 check (latest_build_number >= 0),
  update_mode text not null default 'none' check (update_mode in ('none', 'soft', 'hard')),
  maintenance_mode boolean not null default false,
  message_en text,
  message_zh_hant text,
  store_url text,
  is_active boolean not null default true,
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recommended_build_number >= minimum_build_number),
  check (latest_build_number >= recommended_build_number),
  check (expires_at is null or starts_at is null or starts_at < expires_at)
);

create table private.app_announcements (
  id uuid primary key default gen_random_uuid(),
  announcement_key text not null unique,
  title_en text not null,
  title_zh_hant text not null default '',
  body_en text not null,
  body_zh_hant text not null default '',
  tone text not null default 'info' check (tone in ('info', 'success', 'warning', 'critical')),
  action_label_en text,
  action_label_zh_hant text,
  action_url text,
  is_dismissible boolean not null default true,
  is_active boolean not null default false,
  platform text check (platform in ('ios', 'android', 'web')),
  release_channel text check (release_channel in ('production', 'preview', 'development')),
  min_build_number integer check (min_build_number is null or min_build_number >= 0),
  max_build_number integer check (max_build_number is null or max_build_number >= 0),
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (action_url is null or action_url ~ '^https://[^[:space:]]+$'),
  check (expires_at is null or starts_at is null or starts_at < expires_at),
  check (max_build_number is null or min_build_number is null or min_build_number <= max_build_number)
);

create trigger client_release_policies_set_updated_at
before update on private.client_release_policies
for each row execute function private.set_updated_at();

create trigger app_announcements_set_updated_at
before update on private.app_announcements
for each row execute function private.set_updated_at();

revoke all on private.client_release_policies from public, anon, authenticated;
revoke all on private.app_announcements from public, anon, authenticated;

insert into private.client_release_policies (
  platform,
  release_channel,
  minimum_build_number,
  recommended_build_number,
  latest_build_number,
  update_mode,
  maintenance_mode
)
values
  ('ios', 'production', 1, 14, 14, 'none', false),
  ('android', 'production', 1, 1, 1, 'none', false),
  ('ios', 'preview', 1, 14, 14, 'none', false),
  ('android', 'preview', 1, 1, 1, 'none', false);

-- -------------------------------------------------------------------------
-- Preference RPCs remove v0.0.6's dependency on the transitional physical
-- app_options name and collapse the previous upsert + select waterfall.
-- -------------------------------------------------------------------------

create or replace function public.get_user_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_options public.app_options%rowtype;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  insert into public.app_options (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select options.* into v_options
  from public.app_options as options
  where options.user_id = v_user_id;

  return to_jsonb(v_options);
end;
$$;

create or replace function public.update_user_notification_preferences(
  p_push_enabled boolean default null,
  p_play_sound boolean default null,
  p_show_preview boolean default null,
  p_live_activity_enabled boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_options public.app_options%rowtype;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  insert into public.app_options (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  update public.app_options as options
  set push_enabled = coalesce(p_push_enabled, options.push_enabled),
      play_sound = coalesce(p_play_sound, options.play_sound),
      show_preview = coalesce(p_show_preview, options.show_preview),
      live_activity_enabled = coalesce(p_live_activity_enabled, options.live_activity_enabled),
      updated_at = pg_catalog.now()
  where options.user_id = v_user_id
  returning options.* into v_options;

  return to_jsonb(v_options);
end;
$$;

revoke all on function public.get_user_notification_preferences() from public, anon, authenticated;
revoke all on function public.update_user_notification_preferences(boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_user_notification_preferences() to authenticated;
grant execute on function public.update_user_notification_preferences(boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.update_source_notification_sound(
  p_access_key_id uuid,
  p_sound_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_key public.api_keys%rowtype;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  update public.api_keys as access_key
  set sound_name = p_sound_name,
      updated_at = pg_catalog.now()
  where access_key.id = p_access_key_id
    and access_key.user_id = v_user_id
    and access_key.revoked_at is null
  returning access_key.* into v_key;

  if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
  return to_jsonb(v_key);
end;
$$;

create or replace function public.mark_inbox_notification_read(
  p_notification_id uuid,
  p_read_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  update public.notifications as notification
  set read_at = p_read_at
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid())
    and notification.expires_at > pg_catalog.now();
  return found;
end;
$$;

create or replace function public.mark_all_inbox_notifications_read(
  p_read_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  update public.notifications as notification
  set read_at = p_read_at
  where notification.user_id = (select auth.uid())
    and notification.read_at is null
    and notification.expires_at > pg_catalog.now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.delete_inbox_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHORIZED'; end if;
  delete from public.notifications as notification
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid());
  return found;
end;
$$;

revoke all on function public.update_source_notification_sound(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_inbox_notification_read(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_all_inbox_notifications_read(timestamptz) from public, anon, authenticated;
revoke all on function public.delete_inbox_notification(uuid) from public, anon, authenticated;
grant execute on function public.update_source_notification_sound(uuid, text) to authenticated;
grant execute on function public.mark_inbox_notification_read(uuid, timestamptz) to authenticated;
grant execute on function public.mark_all_inbox_notifications_read(timestamptz) to authenticated;
grant execute on function public.delete_inbox_notification(uuid) to authenticated;

-- Broadcast user-scoped invalidations rather than exposing a table name to
-- v0.0.6 Realtime subscriptions. The triggers survive a later table rename.
create or replace function private.broadcast_user_data_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
begin
  if tg_table_name = 'notifications' then
    perform realtime.send(
      pg_catalog.jsonb_build_object('scope', 'inbox', 'operation', tg_op),
      'changed',
      'zona:inbox:' || v_user_id::text,
      true
    );
  end if;

  perform realtime.send(
    pg_catalog.jsonb_build_object('scope', 'live', 'operation', tg_op),
    'changed',
    'zona:live:' || v_user_id::text,
    true
  );
  return null;
end;
$$;

create trigger notifications_broadcast_user_change
after insert or update or delete on public.notifications
for each row execute function private.broadcast_user_data_change();

create trigger app_options_broadcast_user_change
after insert or update or delete on public.app_options
for each row execute function private.broadcast_user_data_change();

revoke all on function private.broadcast_user_data_change() from public, anon, authenticated;

create or replace function private.broadcast_global_runtime_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object('scope', 'config', 'operation', tg_op),
    'changed',
    'zona:config',
    true
  );
  return null;
end;
$$;

create or replace function private.broadcast_account_runtime_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object('scope', 'config', 'operation', tg_op),
    'changed',
    'zona:config:' || v_user_id::text,
    true
  );
  return null;
end;
$$;

create trigger app_feature_controls_broadcast_change
after insert or update or delete on private.app_feature_controls
for each row execute function private.broadcast_global_runtime_change();

create trigger app_runtime_settings_broadcast_change
after insert or update or delete on private.app_runtime_settings
for each row execute function private.broadcast_global_runtime_change();

create trigger service_plan_limits_broadcast_change
after insert or update or delete on private.service_plan_limits
for each row execute function private.broadcast_global_runtime_change();

create trigger client_release_policies_broadcast_change
after insert or update or delete on private.client_release_policies
for each row execute function private.broadcast_global_runtime_change();

create trigger app_announcements_broadcast_change
after insert or update or delete on private.app_announcements
for each row execute function private.broadcast_global_runtime_change();

create trigger account_entitlements_broadcast_change
after insert or update or delete on private.account_entitlements
for each row execute function private.broadcast_account_runtime_change();

revoke all on function private.broadcast_global_runtime_change() from public, anon, authenticated;
revoke all on function private.broadcast_account_runtime_change() from public, anon, authenticated;

drop policy if exists "Users receive their Zona data broadcasts" on realtime.messages;
create policy "Users receive their Zona data broadcasts"
on realtime.messages for select to authenticated
using ((select realtime.topic()) in (
  'zona:config',
  'zona:config:' || (select auth.uid())::text,
  'zona:inbox:' || (select auth.uid())::text,
  'zona:live:' || (select auth.uid())::text
));

-- -------------------------------------------------------------------------
-- One evaluated bootstrap call. The account tier is derived server-side;
-- rollout assignment uses a stable installation id but never authorizes data.
-- -------------------------------------------------------------------------

create or replace function public.get_app_bootstrap(
  p_platform text,
  p_app_version text,
  p_build_number integer,
  p_release_channel text,
  p_locale text,
  p_installation_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tier text;
  v_features jsonb;
  v_settings jsonb;
  v_policy jsonb;
  v_announcements jsonb;
  v_revision bigint;
  v_refresh_seconds integer;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if p_platform not in ('ios', 'android', 'web')
    or p_release_channel not in ('production', 'preview', 'development')
    or p_locale not in ('en', 'zh-Hant')
    or p_build_number is null
    or p_build_number < 0
    or p_installation_id is null
    or char_length(p_installation_id) not between 1 and 200 then
    raise exception 'INVALID_BOOTSTRAP_CONTEXT';
  end if;

  v_tier := private.effective_plan_code(v_user_id);

  select coalesce(pg_catalog.jsonb_object_agg(
    resolved.feature_key,
    pg_catalog.jsonb_build_object(
      'mode', resolved.mode,
      'reason', case when p_locale = 'zh-Hant'
        then coalesce(nullif(resolved.reason_zh_hant, ''), resolved.reason_en)
        else resolved.reason_en end
    )
  ), '{}'::jsonb)
  into v_features
  from (
    select distinct on (control.feature_key)
      control.feature_key,
      control.mode,
      control.reason_en,
      control.reason_zh_hant
    from private.app_feature_controls as control
    where control.is_active
      and (control.platform is null or control.platform = p_platform)
      and (control.release_channel is null or control.release_channel = p_release_channel)
      and (control.locale is null or control.locale = p_locale)
      and (control.account_tier is null or control.account_tier = v_tier)
      and (control.min_build_number is null or control.min_build_number <= p_build_number)
      and (control.max_build_number is null or control.max_build_number >= p_build_number)
      and (control.starts_at is null or control.starts_at <= pg_catalog.now())
      and (control.expires_at is null or control.expires_at > pg_catalog.now())
      and mod(
        pg_catalog.hashtextextended(p_installation_id || ':' || control.rollout_seed, 0)
          & 9223372036854775807,
        10000
      ) < control.rollout_basis_points
    order by
      control.feature_key,
      control.priority desc,
      ((control.platform is not null)::integer
        + (control.release_channel is not null)::integer
        + (control.locale is not null)::integer
        + (control.account_tier is not null)::integer
        + (control.min_build_number is not null)::integer
        + (control.max_build_number is not null)::integer) desc,
      control.updated_at desc,
      control.id desc
  ) as resolved;

  select coalesce(pg_catalog.jsonb_object_agg(resolved.setting_key, resolved.value), '{}'::jsonb)
  into v_settings
  from (
    select distinct on (setting.setting_key)
      setting.setting_key,
      setting.value
    from private.app_runtime_settings as setting
    where setting.is_active
      and (setting.platform is null or setting.platform = p_platform)
      and (setting.release_channel is null or setting.release_channel = p_release_channel)
      and (setting.locale is null or setting.locale = p_locale)
      and (setting.account_tier is null or setting.account_tier = v_tier)
      and (setting.min_build_number is null or setting.min_build_number <= p_build_number)
      and (setting.max_build_number is null or setting.max_build_number >= p_build_number)
      and (setting.starts_at is null or setting.starts_at <= pg_catalog.now())
      and (setting.expires_at is null or setting.expires_at > pg_catalog.now())
      and mod(
        pg_catalog.hashtextextended(p_installation_id || ':' || setting.rollout_seed, 0)
          & 9223372036854775807,
        10000
      ) < setting.rollout_basis_points
    order by
      setting.setting_key,
      setting.priority desc,
      ((setting.platform is not null)::integer
        + (setting.release_channel is not null)::integer
        + (setting.locale is not null)::integer
        + (setting.account_tier is not null)::integer
        + (setting.min_build_number is not null)::integer
        + (setting.max_build_number is not null)::integer) desc,
      setting.updated_at desc,
      setting.id desc
  ) as resolved;

  select (
    to_jsonb(policy)
      - 'id' - 'created_at' - 'updated_at'
      - 'message_en' - 'message_zh_hant'
  ) || pg_catalog.jsonb_build_object(
    'message', case when p_locale = 'zh-Hant'
      then coalesce(nullif(policy.message_zh_hant, ''), policy.message_en)
      else policy.message_en end
  )
  into v_policy
  from private.client_release_policies as policy
  where policy.platform = p_platform
    and policy.release_channel = p_release_channel
    and policy.is_active
    and (policy.starts_at is null or policy.starts_at <= pg_catalog.now())
    and (policy.expires_at is null or policy.expires_at > pg_catalog.now())
  order by policy.priority desc, policy.updated_at desc, policy.id desc
  limit 1;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', announcement.id,
      'key', announcement.announcement_key,
      'title', case when p_locale = 'zh-Hant'
        then coalesce(nullif(announcement.title_zh_hant, ''), announcement.title_en)
        else announcement.title_en end,
      'body', case when p_locale = 'zh-Hant'
        then coalesce(nullif(announcement.body_zh_hant, ''), announcement.body_en)
        else announcement.body_en end,
      'tone', announcement.tone,
      'actionLabel', case when p_locale = 'zh-Hant'
        then coalesce(nullif(announcement.action_label_zh_hant, ''), announcement.action_label_en)
        else announcement.action_label_en end,
      'actionUrl', announcement.action_url,
      'isDismissible', announcement.is_dismissible
    ) order by announcement.priority desc, announcement.updated_at desc
  ), '[]'::jsonb)
  into v_announcements
  from private.app_announcements as announcement
  where announcement.is_active
    and (announcement.platform is null or announcement.platform = p_platform)
    and (announcement.release_channel is null or announcement.release_channel = p_release_channel)
    and (announcement.min_build_number is null or announcement.min_build_number <= p_build_number)
    and (announcement.max_build_number is null or announcement.max_build_number >= p_build_number)
    and (announcement.starts_at is null or announcement.starts_at <= pg_catalog.now())
    and (announcement.expires_at is null or announcement.expires_at > pg_catalog.now());

  select coalesce(max((extract(epoch from changed_at) * 1000)::bigint), 1)
  into v_revision
  from (
    select max(updated_at) as changed_at from private.app_feature_controls
    union all select max(updated_at) from private.app_runtime_settings
    union all select max(updated_at) from private.service_plan_limits
    union all select max(updated_at) from private.client_release_policies
    union all select max(updated_at) from private.app_announcements
    union all select max(updated_at) from private.account_entitlements where user_id = v_user_id
  ) as revisions;

  v_refresh_seconds := case
    when pg_catalog.jsonb_typeof(v_settings -> 'runtime.refresh_seconds') = 'number'
      then greatest(60, least(3600, (v_settings ->> 'runtime.refresh_seconds')::integer))
    else 300
  end;

  return pg_catalog.jsonb_build_object(
    'revision', v_revision,
    'serverTime', pg_catalog.now(),
    'refreshAfterSeconds', v_refresh_seconds,
    'appVersion', p_app_version,
    'tier', v_tier,
    'features', v_features,
    'settings', v_settings,
    'limits', pg_catalog.jsonb_build_object(
      'maxSourceKeys', private.effective_limit(v_user_id, 'max_api_keys'),
      'retentionDays', private.effective_limit(v_user_id, 'retention_days'),
      'accountNotifyRpm', private.effective_limit(v_user_id, 'notify_rpm'),
      'sourceNotifyRpm', private.effective_limit(v_user_id, 'source_notify_rpm'),
      'maxAttachmentBytes', private.effective_limit(v_user_id, 'attachment_max_bytes'),
      'maxPushDevices', private.effective_limit(v_user_id, 'max_push_devices')
    ),
    'releasePolicy', coalesce(v_policy, '{}'::jsonb),
    'announcements', v_announcements
  );
end;
$$;

revoke all on function public.get_app_bootstrap(text, text, integer, text, text, text)
from public, anon, authenticated;
grant execute on function public.get_app_bootstrap(text, text, integer, text, text, text)
to authenticated;
