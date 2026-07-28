-- User-controlled notification behavior and public API-key metadata.
-- Raw credentials remain hash-only in the private schema.

create table public.app_options (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  play_sound boolean not null default true,
  show_preview boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_prefix text check (key_prefix is null or key_prefix ~ '^zona_live_[A-Za-z0-9_-]{8}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint api_keys_source_owner_fkey
    foreign key (source_id, user_id)
    references public.sources(id, user_id)
    on delete cascade,
  constraint api_keys_revoked_inactive_check
    check (revoked_at is null or is_active = false)
);

create index api_keys_owner_idx on public.api_keys(user_id, created_at desc);
create index api_keys_active_idx on public.api_keys(user_id, is_active, created_at desc);

insert into public.api_keys (
  user_id,
  source_id,
  name,
  is_active,
  created_at,
  updated_at,
  last_used_at,
  revoked_at
)
select
  source.user_id,
  source.id,
  source.display_name,
  source.revoked_at is null,
  source.created_at,
  greatest(source.created_at, coalesce(source.last_seen_at, source.created_at), coalesce(source.revoked_at, source.created_at)),
  source.last_seen_at,
  source.revoked_at
from public.sources as source;

alter table public.app_options enable row level security;
alter table public.api_keys enable row level security;

create policy "Users manage their app options"
on public.app_options for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users read their API keys"
on public.api_keys for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.app_options, public.api_keys from anon, authenticated;
grant select, insert, update on public.app_options to authenticated;
grant select on public.api_keys to authenticated;

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
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_key_prefix is null
    or p_key_prefix !~ '^zona_live_[A-Za-z0-9_-]{8}$' then
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

  insert into public.api_keys (user_id, source_id, name, key_prefix)
  values (p_user_id, v_source_id, pg_catalog.btrim(p_display_name), p_key_prefix);

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'create_source');

  return v_source_id;
end;
$$;

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
  v_key public.api_keys%rowtype;
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

  select key.* into v_key
  from public.api_keys as key
  where key.source_id = p_source_id
    and key.user_id = p_user_id
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

    update public.api_keys
    set name = pg_catalog.btrim(p_display_name),
        updated_at = pg_catalog.now()
    where source_id = p_source_id
    returning * into v_key;
  elsif p_action = 'set_active' then
    if v_source.revoked_at is not null or p_is_active is null then
      return null;
    end if;

    update public.api_keys
    set is_active = p_is_active,
        updated_at = pg_catalog.now()
    where source_id = p_source_id
    returning * into v_key;
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
    where source_id = p_source_id
    returning * into v_key;
  else
    raise exception 'INVALID_ACTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'sourceId', v_source.id,
    'apiKeyId', v_key.id,
    'displayName', v_source.display_name,
    'isActive', v_key.is_active,
    'revokedAt', v_source.revoked_at
  );
end;
$$;

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
    or pg_catalog.octet_length(p_data::text) > 4096
    or (p_attachment_hash is not null and p_attachment_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select credential.source_id into v_source_id
  from private.source_credentials as credential
  join public.api_keys as key on key.source_id = credential.source_id
  where credential.token_hash = p_token_hash
    and key.is_active
    and key.revoked_at is null
    and (key.expires_at is null or key.expires_at > pg_catalog.now());

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || v_source_id::text, 0)
  );

  select source.* into v_source
  from public.sources as source
  join public.api_keys as key
    on key.source_id = source.id
   and key.user_id = source.user_id
  where source.id = v_source_id
    and source.revoked_at is null
    and key.is_active
    and key.revoked_at is null
    and (key.expires_at is null or key.expires_at > pg_catalog.now())
  for update of source, key;

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

  update public.api_keys as api_key
  set last_used_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where api_key.source_id = v_source.id;

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
    false,
    v_notification.attachment_path;
end;
$$;

revoke all on function public.create_source_internal(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.manage_source_internal(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.create_source_internal(uuid, text, text, text, text) to service_role;
grant execute on function public.manage_source_internal(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text) to service_role;

drop function public.create_source_internal(uuid, text, text, text);
drop function public.manage_source_internal(uuid, uuid, text, text);
