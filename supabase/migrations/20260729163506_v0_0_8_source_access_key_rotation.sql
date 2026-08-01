-- v0.0.8 source credentials: one stable source may have several independently
-- revocable keys. Existing tokens and legacy one-row-per-source clients remain
-- valid throughout the additive migration.

alter table private.service_plan_limits
  add column max_access_keys integer;

update private.service_plan_limits
set max_access_keys = greatest(max_source_keys * 3, 10);

alter table private.service_plan_limits
  alter column max_access_keys set not null,
  add constraint service_plan_limits_max_access_keys_check
    check (max_access_keys between 1 and 100000);

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
    'max_access_keys',
    'retention_days',
    'notify_rpm',
    'source_notify_rpm',
    'attachment_max_bytes',
    'max_push_devices'
  ) then raise exception 'INVALID_LIMIT_KEY'; end if;

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
      when 'max_access_keys' then 10
      when 'retention_days' then 7
      when 'notify_rpm' then 20
      when 'source_notify_rpm' then 60
      when 'attachment_max_bytes' then 5242880
      when 'max_push_devices' then 10
    end;
  end if;

  return case p_limit
    when 'max_api_keys' then v_limits.max_source_keys
    when 'max_access_keys' then v_limits.max_access_keys
    when 'retention_days' then v_limits.retention_days
    when 'notify_rpm' then v_limits.account_notify_rpm
    when 'source_notify_rpm' then v_limits.source_notify_rpm
    when 'attachment_max_bytes' then v_limits.max_attachment_bytes
    when 'max_push_devices' then v_limits.max_push_devices
  end;
end;
$$;

alter table public.sources
  add column sound_name text not null default 'default';

alter table public.sources
  add constraint sources_sound_name_check check (
    sound_name in ('default', 'silent')
    or sound_name ~ '^ios-[a-z0-9]+(-[a-z0-9]+)*\.wav$'
  );

update public.sources as source
set sound_name = access_key.sound_name
from public.api_keys as access_key
where access_key.source_id = source.id;

alter table public.api_keys
  add column is_compatibility_primary boolean not null default false;

update public.api_keys
set is_compatibility_primary = true;

alter table public.api_keys
  drop constraint if exists api_keys_source_id_key;

create unique index api_keys_one_compatibility_primary_idx
on public.api_keys (source_id)
where is_compatibility_primary;

alter table public.api_keys
  add constraint api_keys_id_source_unique unique (id, source_id);

create index api_keys_source_created_idx
on public.api_keys (source_id, created_at, id);

alter table private.source_credentials
  add column access_key_id uuid;

update private.source_credentials as credential
set access_key_id = access_key.id
from public.api_keys as access_key
where access_key.source_id = credential.source_id;

alter table private.source_credentials
  alter column access_key_id set not null;

alter table private.source_credentials
  drop constraint source_credentials_pkey;

alter table private.source_credentials
  add constraint source_credentials_pkey primary key (access_key_id);

alter table private.source_credentials
  add constraint source_credentials_key_source_fkey
  foreign key (access_key_id, source_id)
  references public.api_keys (id, source_id)
  on delete cascade;

create index source_credentials_source_idx
on private.source_credentials (source_id);

-- Preserve the old one-row-per-source projection. It selects one representative
-- key, preferring a currently usable key and then the original compatibility
-- key. Sources owned by future integrations may intentionally have no Zona key
-- and are therefore absent only from this legacy projection.
create or replace view public.source_api_keys
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
  representative.id as api_key_id,
  representative.name as api_key_name,
  representative.key_prefix,
  exists (
    select 1
    from public.api_keys as usable
    where usable.source_id = source.id
      and usable.is_active
      and usable.revoked_at is null
      and (usable.expires_at is null or usable.expires_at > pg_catalog.now())
  ) as is_active,
  representative.created_at as key_created_at,
  aggregate_key.updated_at as key_updated_at,
  aggregate_key.last_used_at as key_last_used_at,
  representative.expires_at as key_expires_at,
  case when aggregate_key.active_key_count = 0 then aggregate_key.revoked_at end as key_revoked_at,
  source.sound_name
from public.sources as source
join lateral (
  select access_key.*
  from public.api_keys as access_key
  where access_key.source_id = source.id
  order by
    (
      access_key.is_active
      and access_key.revoked_at is null
      and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now())
    ) desc,
    access_key.is_compatibility_primary desc,
    access_key.created_at,
    access_key.id
  limit 1
) as representative on true
join lateral (
  select
    pg_catalog.max(access_key.updated_at) as updated_at,
    pg_catalog.max(access_key.last_used_at) as last_used_at,
    pg_catalog.max(access_key.revoked_at) as revoked_at,
    pg_catalog.count(*) filter (
      where access_key.revoked_at is null
    ) as active_key_count
  from public.api_keys as access_key
  where access_key.source_id = source.id
) as aggregate_key on true;

create or replace view public.notification_source_overview
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
  representative.id as access_key_id,
  representative.name as access_key_name,
  representative.key_prefix,
  exists (
    select 1
    from public.api_keys as usable
    where usable.source_id = source.id
      and usable.is_active
      and usable.revoked_at is null
      and (usable.expires_at is null or usable.expires_at > pg_catalog.now())
  ) as is_active,
  representative.created_at as access_key_created_at,
  aggregate_key.updated_at as access_key_updated_at,
  aggregate_key.last_used_at as access_key_last_used_at,
  representative.expires_at as access_key_expires_at,
  case when aggregate_key.active_key_count = 0 then aggregate_key.revoked_at end as access_key_revoked_at,
  source.sound_name
from public.sources as source
join lateral (
  select access_key.*
  from public.api_keys as access_key
  where access_key.source_id = source.id
  order by
    (
      access_key.is_active
      and access_key.revoked_at is null
      and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now())
    ) desc,
    access_key.is_compatibility_primary desc,
    access_key.created_at,
    access_key.id
  limit 1
) as representative on true
join lateral (
  select
    pg_catalog.max(access_key.updated_at) as updated_at,
    pg_catalog.max(access_key.last_used_at) as last_used_at,
    pg_catalog.max(access_key.revoked_at) as revoked_at,
    pg_catalog.count(*) filter (
      where access_key.revoked_at is null
    ) as active_key_count
  from public.api_keys as access_key
  where access_key.source_id = source.id
) as aggregate_key on true;

create or replace view public.source_access_keys
with (security_invoker = true)
as select * from public.api_keys;

create or replace view public.notification_sources
with (security_invoker = true)
as select * from public.sources;

create or replace view private.source_api_credentials
with (security_invoker = true)
as
select source_id, token_hash, created_at, access_key_id
from private.source_credentials;

-- The compatibility RPC still accepts a client-generated hash. New clients use
-- the authenticated create-source Edge Function, which generates the plaintext
-- key server-side and calls this same atomic database boundary.
create or replace function public.create_source_uncontrolled_internal(
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
declare
  v_source_id uuid;
  v_access_key_id uuid;
  v_active_sources integer;
  v_recent_creates integer;
begin
  if p_user_id is null
    or p_display_name is null
    or char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80
    or (p_hostname is not null and char_length(pg_catalog.btrim(p_hostname)) not between 1 and 255)
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_key_prefix is null
    or p_key_prefix !~ '^zona_live_[A-Za-z0-9_-]{8}$' then
    raise exception 'INVALID_SOURCE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:sources-user:' || p_user_id::text, 0)
  );

  select pg_catalog.count(*) into v_active_sources
  from public.sources as source
  where source.user_id = p_user_id
    and source.revoked_at is null;

  if v_active_sources >= private.effective_limit(p_user_id, 'max_api_keys') then
    raise exception 'SOURCE_LIMIT_REACHED';
  end if;

  select pg_catalog.count(*) into v_recent_creates
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

  insert into public.api_keys (
    user_id,
    source_id,
    name,
    key_prefix,
    is_compatibility_primary
  ) values (
    p_user_id,
    v_source_id,
    pg_catalog.btrim(p_display_name),
    p_key_prefix,
    true
  )
  returning id into v_access_key_id;

  insert into private.source_credentials (access_key_id, source_id, token_hash)
  values (v_access_key_id, v_source_id, p_token_hash);

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'create_source');

  return v_source_id;
end;
$$;

-- Re-state the runtime-controlled wrapper after reshaping credentials. This
-- same-signature replacement is what create-source and older service clients
-- call; the new uncontrolled body above atomically creates source + key + hash.
create or replace function public.create_source_internal(
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

create or replace function public.create_source_key_internal(
  p_user_id uuid,
  p_source_id uuid,
  p_key_label text,
  p_token_hash text,
  p_key_prefix text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_key_id uuid;
  v_active_keys integer;
  v_account_keys integer;
  v_recent_creates integer;
begin
  if p_user_id is null
    or p_source_id is null
    or p_key_label is null
    or char_length(pg_catalog.btrim(p_key_label)) not between 1 and 80
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_key_prefix is null
    or p_key_prefix !~ '^zona_live_[A-Za-z0-9_-]{8}$' then
    raise exception 'INVALID_SOURCE_KEY';
  end if;

  if not private.service_switch_enabled('sources.create', false) then
    raise exception 'SOURCE_CREATION_DISABLED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || p_source_id::text, 0)
  );

  if not exists (
    select 1
    from public.sources as source
    where source.id = p_source_id
      and source.user_id = p_user_id
      and source.revoked_at is null
  ) then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  select pg_catalog.count(*) into v_active_keys
  from public.api_keys as access_key
  where access_key.source_id = p_source_id
    and access_key.revoked_at is null;

  if v_active_keys >= 10 then
    raise exception 'SOURCE_KEY_LIMIT_REACHED';
  end if;

  select pg_catalog.count(*) into v_account_keys
  from public.api_keys as access_key
  where access_key.user_id = p_user_id
    and access_key.revoked_at is null;

  if v_account_keys >= private.effective_limit(p_user_id, 'max_access_keys') then
    raise exception 'ACCESS_KEY_LIMIT_REACHED';
  end if;

  select pg_catalog.count(*) into v_recent_creates
  from private.account_rate_events as event
  where event.user_id = p_user_id
    and event.event_type = 'create_source_key'
    and event.requested_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_creates >= 30 then
    raise exception 'CREATE_RATE_LIMITED';
  end if;

  insert into public.api_keys (user_id, source_id, name, key_prefix)
  values (
    p_user_id,
    p_source_id,
    pg_catalog.btrim(p_key_label),
    p_key_prefix
  )
  returning id into v_access_key_id;

  insert into private.source_credentials (access_key_id, source_id, token_hash)
  values (v_access_key_id, p_source_id, p_token_hash);

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'create_source_key');

  return v_access_key_id;
end;
$$;

-- New clients need both stable IDs in the same transaction that issues the
-- initial credential. The legacy create_source_internal UUID result remains
-- unchanged for older builds.
create or replace function public.create_source_with_key_internal(
  p_user_id uuid,
  p_display_name text,
  p_hostname text,
  p_token_hash text,
  p_key_prefix text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_access_key_id uuid;
begin
  v_source_id := public.create_source_internal(
    p_user_id,
    p_display_name,
    p_hostname,
    p_token_hash,
    p_key_prefix
  );

  select access_key.id into strict v_access_key_id
  from public.api_keys as access_key
  where access_key.source_id = v_source_id
    and access_key.is_compatibility_primary;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_source_id,
    'accessKeyId', v_access_key_id
  );
end;
$$;

create or replace function public.manage_source_key_internal(
  p_user_id uuid,
  p_access_key_id uuid,
  p_action text,
  p_key_label text default null,
  p_is_active boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_keys%rowtype;
  v_source public.sources%rowtype;
begin
  if p_user_id is null or p_access_key_id is null then
    raise exception 'INVALID_SOURCE_KEY';
  end if;

  select access_key.* into v_key
  from public.api_keys as access_key
  where access_key.id = p_access_key_id
    and access_key.user_id = p_user_id
  for update;

  if not found then return null; end if;

  select source.* into v_source
  from public.sources as source
  where source.id = v_key.source_id
    and source.user_id = p_user_id
  for update;

  if not found then return null; end if;

  if p_action = 'rename' then
    if v_key.revoked_at is not null
      or p_key_label is null
      or char_length(pg_catalog.btrim(p_key_label)) not between 1 and 80 then
      raise exception 'INVALID_SOURCE_KEY';
    end if;
    update public.api_keys
    set name = pg_catalog.btrim(p_key_label),
        updated_at = pg_catalog.now()
    where id = p_access_key_id
    returning * into v_key;
  elsif p_action = 'set_active' then
    if v_source.revoked_at is not null
      or v_key.revoked_at is not null
      or p_is_active is null then
      raise exception 'INVALID_SOURCE_KEY';
    end if;
    update public.api_keys
    set is_active = p_is_active,
        updated_at = pg_catalog.now()
    where id = p_access_key_id
    returning * into v_key;
  elsif p_action = 'revoke' then
    update public.api_keys
    set is_active = false,
        revoked_at = coalesce(revoked_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = p_access_key_id
    returning * into v_key;
  else
    raise exception 'INVALID_ACTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_key.source_id,
    'accessKeyId', v_key.id,
    'keyLabel', v_key.name,
    'isActive', v_key.is_active,
    'revokedAt', v_key.revoked_at
  );
end;
$$;

-- Legacy source actions intentionally aggregate over every key so old clients
-- still pause or revoke a complete source. Individual key actions use the new
-- manage-source-key endpoint.
create or replace function public.manage_source_internal(
  p_user_id uuid,
  p_source_id uuid,
  p_action text,
  p_display_name text default null,
  p_is_active boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.sources%rowtype;
  v_primary_key_id uuid;
  v_any_active boolean;
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

  if not found then return null; end if;

  select access_key.id into v_primary_key_id
  from public.api_keys as access_key
  where access_key.source_id = p_source_id
  order by access_key.is_compatibility_primary desc, access_key.created_at, access_key.id
  limit 1;

  if p_action = 'rename' then
    if v_source.revoked_at is not null
      or p_display_name is null
      or char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80 then
      raise exception 'INVALID_SOURCE';
    end if;
    update public.sources
    set display_name = pg_catalog.btrim(p_display_name)
    where id = p_source_id
    returning * into v_source;
    update public.api_keys
    set name = pg_catalog.btrim(p_display_name),
        updated_at = pg_catalog.now()
    where id = v_primary_key_id;
  elsif p_action = 'set_active' then
    if v_source.revoked_at is not null or p_is_active is null then return null; end if;
    update public.api_keys
    set is_active = p_is_active,
        updated_at = pg_catalog.now()
    where source_id = p_source_id
      and revoked_at is null;
  elsif p_action = 'revoke' then
    if v_source.revoked_at is null then
      update public.sources
      set revoked_at = pg_catalog.now()
      where id = p_source_id
      returning * into v_source;
    end if;
    update public.api_keys
    set is_active = false,
        revoked_at = coalesce(revoked_at, v_source.revoked_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where source_id = p_source_id;
  else
    raise exception 'INVALID_ACTION';
  end if;

  select coalesce(pg_catalog.bool_or(
    access_key.is_active
    and access_key.revoked_at is null
    and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now())
  ), false) into v_any_active
  from public.api_keys as access_key
  where access_key.source_id = p_source_id;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_source.id,
    'apiKeyId', v_primary_key_id,
    'displayName', v_source.display_name,
    'isActive', v_any_active,
    'revokedAt', v_source.revoked_at
  );
end;
$$;

-- Keep the old access-key-ID sound RPC operational while storing the setting
-- once per source. The deprecated api_keys.sound_name column mirrors the value
-- only for compatibility and may be removed after old clients retire.
create or replace function public.update_source_notification_sound(
  p_access_key_id uuid,
  p_sound_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_source public.sources%rowtype;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select source.* into v_source
  from public.api_keys as access_key
  join public.sources as source
    on source.id = access_key.source_id
   and source.user_id = access_key.user_id
  where access_key.id = p_access_key_id
    and access_key.user_id = v_user_id
    and source.revoked_at is null
  for update of source;

  if not found then raise exception 'SOURCE_NOT_FOUND'; end if;

  update public.sources
  set sound_name = p_sound_name
  where id = v_source.id
  returning * into v_source;

  update public.api_keys
  set sound_name = p_sound_name,
      updated_at = pg_catalog.now()
  where source_id = v_source.id;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_source.id,
    'soundName', v_source.sound_name
  );
end;
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
  join public.api_keys as access_key
    on access_key.id = credential.access_key_id
   and access_key.source_id = credential.source_id
  join public.sources as source
    on source.id = access_key.source_id
   and source.user_id = access_key.user_id
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

create or replace function public.sender_is_premium(p_token_hash text)
returns boolean
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
  join public.api_keys as access_key
    on access_key.id = credential.access_key_id
   and access_key.source_id = credential.source_id
  join public.sources as source
    on source.id = access_key.source_id
   and source.user_id = access_key.user_id
  where credential.token_hash = p_token_hash
    and source.revoked_at is null
    and access_key.is_active
    and access_key.revoked_at is null
    and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now());
  return found and private.user_is_premium(v_owner);
end;
$$;

-- Replace the seven-argument ingest boundary so a token authenticates its exact
-- access key. A revoked sibling can never borrow another key's active state.
create or replace function public.ingest_notification_internal(
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
  v_access_key public.api_keys%rowtype;
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
    or pg_catalog.octet_length(p_data::text) > 4096
    or (p_attachment_hash is not null and p_attachment_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if not private.service_switch_enabled('api.v1.notifications.accept', false) then
    raise exception 'NOTIFICATION_INGESTION_DISABLED';
  end if;

  select access_key.* into v_access_key
  from private.source_credentials as credential
  join public.api_keys as access_key
    on access_key.id = credential.access_key_id
   and access_key.source_id = credential.source_id
  where credential.token_hash = p_token_hash;

  if not found then raise exception 'INVALID_TOKEN'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || v_access_key.source_id::text, 0)
  );

  select access_key.* into v_access_key
  from private.source_credentials as credential
  join public.api_keys as access_key
    on access_key.id = credential.access_key_id
   and access_key.source_id = credential.source_id
  where credential.token_hash = p_token_hash
    and access_key.is_active
    and access_key.revoked_at is null
    and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now())
  for update of access_key;

  if not found then raise exception 'INVALID_TOKEN'; end if;

  select source.* into v_source
  from public.sources as source
  where source.id = v_access_key.source_id
    and source.user_id = v_access_key.user_id
    and source.revoked_at is null
  for update;

  if not found then raise exception 'INVALID_TOKEN'; end if;

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'title', pg_catalog.btrim(p_title),
          'body', pg_catalog.btrim(p_body),
          'category', nullif(pg_catalog.btrim(p_category), ''),
          'data', p_data,
          'attachment', p_attachment_hash
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
      true,
      v_notification.attachment_path;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:ingest-user:' || v_source.user_id::text, 0)
  );

  select pg_catalog.count(*) into v_source_request_count
  from private.ingest_requests as request
  where request.source_id = v_source.id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';
  if v_source_request_count >= private.effective_limit(v_source.user_id, 'source_notify_rpm') then
    raise exception 'RATE_LIMITED';
  end if;

  select pg_catalog.count(*) into v_user_request_count
  from private.ingest_requests as request
  where request.user_id = v_source.user_id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';
  if v_user_request_count >= private.effective_limit(v_source.user_id, 'notify_rpm') then
    raise exception 'ACCOUNT_RATE_LIMITED';
  end if;

  insert into private.ingest_requests (source_id, user_id)
  values (v_source.id, v_source.user_id);

  update public.sources
  set last_seen_at = pg_catalog.now()
  where id = v_source.id;

  update public.api_keys
  set last_used_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_access_key.id;

  insert into public.notifications (
    user_id,
    source_id,
    source_name_snapshot,
    title,
    body,
    category,
    data,
    idempotency_key,
    request_hash,
    expires_at
  ) values (
    v_source.user_id,
    v_source.id,
    v_source.display_name,
    pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_body),
    nullif(pg_catalog.btrim(p_category), ''),
    p_data,
    p_idempotency_key,
    v_request_hash,
    pg_catalog.now() + make_interval(days => private.effective_limit(v_source.user_id, 'retention_days'))
  )
  returning * into v_notification;

  return query select
    v_notification.id,
    v_source.id,
    v_source.display_name,
    v_source.user_id,
    v_notification.created_at,
    false,
    v_notification.attachment_path;
end;
$$;

create or replace function public.create_test_notification_uncontrolled_internal(
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
declare
  v_source public.sources%rowtype;
  v_notification public.notifications%rowtype;
begin
  if p_user_id is null or p_source_id is null then raise exception 'INVALID_SOURCE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || p_source_id::text, 0)
  );

  select source.* into v_source
  from public.sources as source
  where source.id = p_source_id
    and source.user_id = p_user_id
    and source.revoked_at is null
  for update;

  if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
  if not exists (
    select 1
    from public.api_keys as access_key
    where access_key.source_id = p_source_id
      and access_key.is_active
      and access_key.revoked_at is null
      and (access_key.expires_at is null or access_key.expires_at > pg_catalog.now())
  ) then raise exception 'INVALID_TOKEN'; end if;

  update public.sources
  set last_seen_at = pg_catalog.now()
  where id = p_source_id;

  insert into public.notifications (
    user_id, source_id, source_name_snapshot, title, body, category, data,
    idempotency_key, request_hash
  ) values (
    p_user_id,
    p_source_id,
    v_source.display_name,
    'Zona is connected',
    'This test alert came from ' || v_source.display_name || '.',
    'test',
    '{}'::jsonb,
    'app-test-' || extensions.gen_random_uuid()::text,
    pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(extensions.gen_random_uuid()::text, 'UTF8'), 'sha256'),
      'hex'
    )
  )
  returning * into v_notification;

  return query select
    v_notification.id,
    v_source.id,
    v_source.display_name,
    v_source.user_id,
    v_notification.created_at,
    v_source.sound_name;
end;
$$;

revoke all on function public.create_source_key_internal(uuid, uuid, text, text, text)
from public, anon, authenticated;
revoke all on function public.create_source_internal(uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.create_source_with_key_internal(uuid, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.manage_source_key_internal(uuid, uuid, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.create_source_key_internal(uuid, uuid, text, text, text)
to service_role;
grant execute on function public.create_source_internal(uuid, text, text, text, text)
to service_role;
grant execute on function public.create_source_with_key_internal(uuid, text, text, text, text)
to service_role;
grant execute on function public.manage_source_key_internal(uuid, uuid, text, text, boolean)
to service_role;

revoke all on public.source_api_keys, public.notification_source_overview,
  public.source_access_keys, public.notification_sources from anon, authenticated;
grant select on public.source_api_keys, public.notification_source_overview,
  public.source_access_keys, public.notification_sources to authenticated;
grant select on public.source_api_keys, public.notification_source_overview,
  public.source_access_keys, public.notification_sources to service_role;

revoke all on private.source_api_credentials from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.sources as source
    where not exists (
      select 1 from public.api_keys as access_key
      where access_key.source_id = source.id
        and access_key.is_compatibility_primary
    )
  ) then raise exception 'SOURCE_KEY_BACKFILL_INCOMPLETE'; end if;

  if exists (
    select 1
    from private.source_credentials as credential
    left join public.api_keys as access_key
      on access_key.id = credential.access_key_id
     and access_key.source_id = credential.source_id
    where access_key.id is null
  ) then raise exception 'SOURCE_CREDENTIAL_BACKFILL_INCOMPLETE'; end if;
end;
$$;
