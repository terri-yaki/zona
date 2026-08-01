-- Universal (not per-user) app options controlled by the operator, plus
-- premium-tier columns on the per-user app_options row. Limits that were
-- hardcoded (100 API keys, 300 notify requests/minute per account, 7-day
-- retention, 5 MiB attachments) now resolve from this store at enforcement
-- time, with a standard and a premium variant per user-facing limit. Changing
-- a value requires a SQL update only — no app repackage or function redeploy.
-- Forward-only: do not fold into an already-applied migration.

create table public.universal_app_options (
  -- Exactly one row; the boolean key makes a second row impossible.
  id boolean primary key default true check (id),
  user_guide_url text not null
    check (user_guide_url ~ '^https://[^\s]+$'),
  max_api_keys_standard integer not null check (max_api_keys_standard between 1 and 100000),
  max_api_keys_premium integer not null check (max_api_keys_premium between 1 and 100000),
  retention_days_standard integer not null check (retention_days_standard between 1 and 365),
  retention_days_premium integer not null check (retention_days_premium between 1 and 365),
  notify_rpm_standard integer not null check (notify_rpm_standard between 1 and 100000),
  notify_rpm_premium integer not null check (notify_rpm_premium between 1 and 100000),
  attachment_max_bytes_standard integer not null check (attachment_max_bytes_standard between 1024 and 52428800),
  attachment_max_bytes_premium integer not null check (attachment_max_bytes_premium between 1024 and 52428800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Standard values preserve the previously hardcoded behavior. Premium values
-- are the monetised tier and can be tuned by the operator at any time.
insert into public.universal_app_options (
  id,
  user_guide_url,
  max_api_keys_standard,
  max_api_keys_premium,
  retention_days_standard,
  retention_days_premium,
  notify_rpm_standard,
  notify_rpm_premium,
  attachment_max_bytes_standard,
  attachment_max_bytes_premium
) values (
  true,
  'https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc',
  100,
  500,
  7,
  30,
  300,
  1000,
  5242880,
  20971520
);

alter table public.universal_app_options enable row level security;

-- The app reads the guide URL and its retention tier. Writes (operator/admin
-- changes) go through the service role or SQL only; there is deliberately no
-- authenticated write policy.
create policy "Authenticated users read universal app options"
on public.universal_app_options for select to authenticated
using (true);

revoke all on public.universal_app_options from anon, authenticated;
grant select on public.universal_app_options to authenticated;

-- Monetisation/subscription state on the user-level options row. These
-- columns are server-controlled: the mobile client must never set its own
-- premium tier, so a trigger rejects non-service-role changes to them even
-- though the row is otherwise user-writable.
alter table public.app_options
  add column is_premium boolean not null default false,
  add column premium_plan text,
  add column premium_status text,
  add column premium_expires_at timestamptz,
  add column premium_store text,
  add column premium_product_id text,
  add column premium_customer_id text;

create or replace function private.guard_app_options_premium()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_user <> 'service_role' then
    if tg_op = 'INSERT' then
      if new.is_premium
        or new.premium_plan is not null
        or new.premium_status is not null
        or new.premium_expires_at is not null
        or new.premium_store is not null
        or new.premium_product_id is not null
        or new.premium_customer_id is not null then
        raise exception 'PREMIUM_FIELDS_READONLY';
      end if;
    elsif new.is_premium is distinct from old.is_premium
      or new.premium_plan is distinct from old.premium_plan
      or new.premium_status is distinct from old.premium_status
      or new.premium_expires_at is distinct from old.premium_expires_at
      or new.premium_store is distinct from old.premium_store
      or new.premium_product_id is distinct from old.premium_product_id
      or new.premium_customer_id is distinct from old.premium_customer_id then
      raise exception 'PREMIUM_FIELDS_READONLY';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists app_options_guard_premium on public.app_options;
create trigger app_options_guard_premium
before insert or update on public.app_options
for each row execute function private.guard_app_options_premium();

-- Tier resolution is server-side only: an active premium flag whose optional
-- expiry has not passed. Client-sent flags never reach enforcement code.
create or replace function private.user_is_premium(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select options.is_premium
      and (options.premium_expires_at is null or options.premium_expires_at > pg_catalog.now())
    from public.app_options as options
    where options.user_id = p_user_id
  ), false);
end;
$$;

-- Single lookup point for every configurable limit. Falls back to the
-- pre-migration constants when the universal row is missing so behavior never
-- breaks, and selects the standard or premium variant by server-resolved tier.
create or replace function private.effective_limit(p_user_id uuid, p_limit text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_options public.universal_app_options%rowtype;
  v_premium boolean;
begin
  if p_limit not in ('max_api_keys', 'retention_days', 'notify_rpm', 'attachment_max_bytes') then
    raise exception 'INVALID_LIMIT_KEY';
  end if;

  select options.* into v_options
  from public.universal_app_options as options
  where options.id = true;

  if not found then
    return case p_limit
      when 'max_api_keys' then 100
      when 'retention_days' then 7
      when 'notify_rpm' then 300
      when 'attachment_max_bytes' then 5242880
    end;
  end if;

  v_premium := private.user_is_premium(p_user_id);

  return case p_limit
    when 'max_api_keys' then case when v_premium
      then v_options.max_api_keys_premium else v_options.max_api_keys_standard end
    when 'retention_days' then case when v_premium
      then v_options.retention_days_premium else v_options.retention_days_standard end
    when 'notify_rpm' then case when v_premium
      then v_options.notify_rpm_premium else v_options.notify_rpm_standard end
    when 'attachment_max_bytes' then case when v_premium
      then v_options.attachment_max_bytes_premium else v_options.attachment_max_bytes_standard end
  end;
end;
$$;

-- Lets the notify Edge Function size its pre-ingest attachment check to the
-- caller's tier before parsing the (potentially large) request body. Limit
-- values are not secret — the universal row is app-readable — and an unknown
-- token simply resolves to the standard tier; ingest still rejects it later.
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
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select source.user_id into v_owner
  from private.source_credentials as credential
  join public.sources as source on source.id = credential.source_id
  where credential.token_hash = p_token_hash
    and source.revoked_at is null;

  if not found then
    return false;
  end if;

  return private.user_is_premium(v_owner);
end;
$$;

revoke all on function private.guard_app_options_premium() from public, anon, authenticated;
revoke all on function private.user_is_premium(uuid) from public, anon, authenticated;
revoke all on function private.effective_limit(uuid, text) from public, anon, authenticated;
revoke all on function public.sender_is_premium(text) from public, anon, authenticated;
grant execute on function public.sender_is_premium(text) to service_role;

-- ---------------------------------------------------------------------------
-- Enforcement rewiring. Each function below is the latest definition from its
-- lineage with only the hardcoded constant replaced by effective_limit().
-- ---------------------------------------------------------------------------

-- API-key cap: was a fixed 100 active sources; revoked sources/keys never
-- counted and still do not.
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

  if v_active_sources >= private.effective_limit(p_user_id, 'max_api_keys') then
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

-- Per-account notify rate limit (was fixed 300/min) and the retention window
-- (was the fixed 7-day expires_at default) now resolve per owner tier. The
-- per-source 60/minute limit is unchanged by design. Retention is stamped at
-- ingest time, so existing rows keep their original expiry and the cleanup
-- job needs no changes.
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

  if v_user_request_count >= private.effective_limit(v_source.user_id, 'notify_rpm') then
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

-- Attachment cap: was a fixed 5 MiB; now the owner's tiered limit. The Edge
-- Function performs the same check pre-ingest via sender_is_premium() so
-- oversized uploads are rejected before the body is parsed.
create or replace function public.attach_notification_image_internal(
  p_notification_id uuid,
  p_path text,
  p_mime text,
  p_bytes integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select notification.user_id into v_owner
  from public.notifications as notification
  where notification.id = p_notification_id;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  if p_path is null
    or p_path <> v_owner::text || '/' || p_notification_id::text
    or p_mime is null
    or p_mime not in ('image/png', 'image/jpeg', 'image/webp')
    or p_bytes is null
    or p_bytes < 1
    or p_bytes > private.effective_limit(v_owner, 'attachment_max_bytes') then
    raise exception 'INVALID_ATTACHMENT';
  end if;

  update public.notifications as notification
  set attachment_path = p_path,
      attachment_mime = p_mime,
      attachment_bytes = p_bytes
  where notification.id = p_notification_id;
end;
$$;

-- The column-level upper bound (5 MiB) predates configurable limits and would
-- reject legitimate premium uploads. The upper bound is now enforced by
-- attach_notification_image_internal against the tiered limit; the constraint
-- keeps the structural checks.
alter table public.notifications
  drop constraint notifications_attachment_check;

alter table public.notifications
  add constraint notifications_attachment_check check (
    (attachment_path is null and attachment_mime is null and attachment_bytes is null)
    or (
      attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
      and attachment_mime in ('image/png', 'image/jpeg', 'image/webp')
      and attachment_bytes >= 1
    )
  ) not valid;

alter table public.notifications
  validate constraint notifications_attachment_check;
