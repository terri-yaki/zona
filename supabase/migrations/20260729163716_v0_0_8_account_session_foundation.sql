-- v0.0.8 account/session foundation. This migration is additive: legacy
-- user_id ownership remains authoritative until older mobile builds retire.

create table private.accounts (
  id uuid primary key,
  kind text not null default 'personal' check (kind in ('personal', 'team')),
  status text not null default 'active'
    check (status in ('active', 'transfer_locked', 'transferred', 'suspended', 'deleting', 'deleted')),
  protected_at timestamptz,
  deletion_requested_at timestamptz,
  transferred_to_account_id uuid references private.accounts(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check ((status = 'transferred') = (transferred_to_account_id is not null))
);

create table private.personal_account_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null unique references private.accounts(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create index accounts_transferred_to_idx
on private.accounts (transferred_to_account_id)
where transferred_to_account_id is not null;

create table private.account_memberships (
  account_id uuid not null references private.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, user_id)
);

create index account_memberships_user_status_idx
on private.account_memberships (user_id, status, account_id);

create table public.account_profiles (
  account_id uuid primary key references private.accounts(id) on delete cascade,
  display_name text check (display_name is null or char_length(pg_catalog.btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(pg_catalog.btrim(display_name)) between 1 and 80),
  locale text check (locale is null or locale in ('en', 'zh-Hant')),
  timezone text check (timezone is null or char_length(timezone) between 1 and 64),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table private.app_installations (
  id uuid primary key,
  platform text not null check (platform in ('ios', 'android', 'web')),
  display_name text check (display_name is null or char_length(pg_catalog.btrim(display_name)) between 1 and 80),
  app_version text check (app_version is null or char_length(app_version) between 1 and 32),
  build_number integer check (build_number is null or build_number >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now()
);

create index app_installations_seen_idx
on private.app_installations (last_seen_at desc);

create table private.installation_sessions (
  installation_id uuid not null references private.app_installations(id) on delete cascade,
  session_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references private.accounts(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  bound_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  primary key (installation_id, session_id),
  check ((status = 'revoked') = (revoked_at is not null))
);

create index installation_sessions_user_status_idx
on private.installation_sessions (user_id, status, last_seen_at desc);

create index installation_sessions_account_idx
on private.installation_sessions (account_id, status);

create table private.account_installation_subscriptions (
  account_id uuid not null references private.accounts(id) on delete cascade,
  installation_id uuid not null references private.app_installations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_enabled boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, installation_id)
);

create index account_installation_subscriptions_user_idx
on private.account_installation_subscriptions (user_id, delivery_enabled);

create index account_installation_subscriptions_installation_idx
on private.account_installation_subscriptions (installation_id, account_id);

create table private.account_auth_events (
  id bigint generated always as identity primary key,
  account_id uuid,
  user_id uuid,
  installation_id uuid,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  result text not null check (result in ('success', 'blocked', 'failed')),
  request_id uuid,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  check (pg_catalog.jsonb_typeof(context) = 'object'),
  check (pg_catalog.octet_length(context::text) <= 2048)
);

create index account_auth_events_account_created_idx
on private.account_auth_events (account_id, created_at desc);

create table private.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 160),
  account_id_snapshot uuid not null,
  user_id_snapshot uuid not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'data_deleted', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  cleanup jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(cleanup) = 'object'),
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz
);

create index account_deletion_jobs_status_updated_idx
on private.account_deletion_jobs (status, updated_at);

-- Transfer records are deliberately inert in v0.0.8. They reserve the
-- short-lived dual-proof/idempotency contract without permitting a partial
-- database-only move while Storage staging and recovery are unfinished.
create table private.account_transfer_jobs (
  id uuid primary key default gen_random_uuid(),
  source_account_id uuid not null references private.accounts(id) on delete restrict,
  destination_account_id uuid not null references private.accounts(id) on delete restrict,
  source_user_id uuid not null,
  destination_user_id uuid not null,
  source_session_id uuid not null,
  destination_session_id uuid not null,
  challenge_hash text not null check (challenge_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 160),
  status text not null default 'proof_pending'
    check (status in ('proof_pending', 'proof_complete', 'previewed', 'committing', 'completed', 'cancelled', 'expired', 'failed')),
  preview jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(preview) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  check (source_account_id <> destination_account_id),
  check (source_user_id <> destination_user_id),
  check (expires_at <= created_at + interval '15 minutes')
);

create index account_transfer_jobs_expiry_idx
on private.account_transfer_jobs (status, expires_at);

create index account_transfer_jobs_source_idx
on private.account_transfer_jobs (source_account_id, created_at desc);

create index account_transfer_jobs_destination_idx
on private.account_transfer_jobs (destination_account_id, created_at desc);

revoke all on private.accounts, private.personal_account_owners,
  private.account_memberships, private.app_installations,
  private.installation_sessions, private.account_installation_subscriptions,
  private.account_auth_events, private.account_deletion_jobs,
  private.account_transfer_jobs
from public, anon, authenticated;

alter table public.account_profiles enable row level security;
alter table public.user_profiles enable row level security;
revoke all on public.account_profiles, public.user_profiles from anon, authenticated;

create or replace function private.ensure_personal_account(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users as auth_user where auth_user.id = p_user_id
  ) then
    raise exception 'INVALID_USER';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:personal-account:' || p_user_id::text, 0)
  );

  select owner.account_id into v_account_id
  from private.personal_account_owners as owner
  where owner.user_id = p_user_id;

  if found then return v_account_id; end if;

  -- Reusing the user UUID only as an initial account UUID makes the backfill
  -- deterministic; the tables intentionally have no account-to-user FK.
  v_account_id := p_user_id;
  insert into private.accounts (id) values (v_account_id)
  on conflict (id) do nothing;
  insert into private.personal_account_owners (user_id, account_id)
  values (p_user_id, v_account_id);
  insert into private.account_memberships (account_id, user_id, role)
  values (v_account_id, p_user_id, 'owner')
  on conflict (account_id, user_id) do update
    set role = 'owner', status = 'active', updated_at = pg_catalog.now();
  insert into public.account_profiles (account_id) values (v_account_id)
  on conflict (account_id) do nothing;
  insert into public.user_profiles (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  return v_account_id;
end;
$$;

revoke all on function private.ensure_personal_account(uuid) from public, anon, authenticated;
grant execute on function private.ensure_personal_account(uuid) to service_role;

do $$
declare v_user_id uuid;
begin
  for v_user_id in select id from auth.users loop
    perform private.ensure_personal_account(v_user_id);
  end loop;
end;
$$;

create or replace function private.record_account_event(
  p_account_id uuid,
  p_user_id uuid,
  p_installation_id uuid,
  p_event_type text,
  p_result text,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type is null
    or p_event_type !~ '^[a-z][a-z0-9_.-]{1,79}$'
    or p_result not in ('success', 'blocked', 'failed')
    or p_context is null
    or pg_catalog.jsonb_typeof(p_context) <> 'object'
    or pg_catalog.octet_length(p_context::text) > 2048 then
    raise exception 'INVALID_AUDIT_EVENT';
  end if;
  insert into private.account_auth_events (
    account_id, user_id, installation_id, event_type, result, context
  ) values (
    p_account_id, p_user_id, p_installation_id, p_event_type, p_result, p_context
  );
end;
$$;

revoke all on function private.record_account_event(uuid, uuid, uuid, text, text, jsonb)
from public, anon, authenticated;

create or replace function public.ensure_personal_account_internal(p_user_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$ select private.ensure_personal_account(p_user_id); $$;

revoke all on function public.ensure_personal_account_internal(uuid) from public, anon, authenticated;
grant execute on function public.ensure_personal_account_internal(uuid) to service_role;

create or replace function public.assert_account_active_internal(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_account_id uuid;
begin
  v_account_id := private.ensure_personal_account(p_user_id);
  if not exists (
    select 1 from private.accounts as account
    join private.account_memberships as membership on membership.account_id = account.id
    where account.id = v_account_id
      and account.status = 'active'
      and membership.user_id = p_user_id
      and membership.status = 'active'
  ) then raise exception 'ACCOUNT_INACTIVE'; end if;
  return v_account_id;
end;
$$;

revoke all on function public.assert_account_active_internal(uuid) from public, anon, authenticated;
grant execute on function public.assert_account_active_internal(uuid) to service_role;

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

create or replace function private.refresh_account_protection(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_protected_at timestamptz;
begin
  v_account_id := private.ensure_personal_account(p_user_id);
  select pg_catalog.min(identity.created_at) into v_protected_at
  from auth.identities as identity
  where identity.user_id = p_user_id and identity.provider <> 'anonymous';
  update private.accounts set
    protected_at = v_protected_at,
    updated_at = case when protected_at is distinct from v_protected_at
      then pg_catalog.now() else updated_at end
  where id = v_account_id;
  return v_protected_at;
end;
$$;

revoke all on function private.refresh_account_protection(uuid) from public, anon, authenticated;

create or replace function public.get_account_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account_id uuid;
  v_user auth.users%rowtype;
  v_account private.accounts%rowtype;
  v_profile public.account_profiles%rowtype;
  v_identities jsonb;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  v_account_id := private.ensure_personal_account(v_user_id);
  perform private.refresh_account_protection(v_user_id);
  perform private.assert_active_zona_session();

  select auth_user.* into strict v_user from auth.users as auth_user where auth_user.id = v_user_id;
  select account.* into strict v_account from private.accounts as account where account.id = v_account_id;
  select profile.* into v_profile from public.account_profiles as profile where profile.account_id = v_account_id;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', identity.id,
      'provider', identity.provider,
      'createdAt', identity.created_at
    ) order by identity.created_at
  ), '[]'::jsonb)
  into v_identities
  from auth.identities as identity
  where identity.user_id = v_user_id;

  return pg_catalog.jsonb_build_object(
    'account', pg_catalog.jsonb_build_object(
      'id', v_account.id,
      'kind', v_account.kind,
      'status', v_account.status,
      'displayName', v_profile.display_name,
      'protectedAt', v_account.protected_at,
      'createdAt', v_account.created_at
    ),
    'user', pg_catalog.jsonb_build_object(
      'id', v_user.id,
      'isAnonymous', coalesce(v_user.is_anonymous, false),
      'recoveryEmail', case when v_user.email_confirmed_at is not null then v_user.email else null end,
      'emailVerified', v_user.email_confirmed_at is not null,
      'identities', v_identities
    )
  );
end;
$$;

revoke all on function public.get_account_summary() from public, anon, authenticated;
grant execute on function public.get_account_summary() to authenticated;

create or replace function public.bind_account_installation_internal(
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
declare
  v_account_id uuid;
begin
  if p_user_id is null or p_session_id is null or p_installation_id is null
    or p_platform not in ('ios', 'android', 'web')
    or (p_app_version is not null and char_length(pg_catalog.btrim(p_app_version)) not between 1 and 32)
    or (p_build_number is not null and p_build_number < 0)
    or (p_display_name is not null and char_length(pg_catalog.btrim(p_display_name)) not between 1 and 80) then
    raise exception 'INVALID_INSTALLATION';
  end if;
  if not exists (
    select 1 from auth.sessions as auth_session
    where auth_session.id = p_session_id and auth_session.user_id = p_user_id
  ) then
    raise exception 'INVALID_SESSION';
  end if;
  if exists (
    select 1 from private.installation_sessions as binding
    where binding.session_id = p_session_id
      and (binding.status = 'revoked' or binding.revoked_at is not null)
  ) then raise exception 'INVALID_SESSION'; end if;

  v_account_id := private.ensure_personal_account(p_user_id);
  if not exists (
    select 1 from private.accounts as account
    where account.id = v_account_id and account.status = 'active'
  ) then raise exception 'ACCOUNT_INACTIVE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:installation:' || p_installation_id::text, 0)
  );
  -- A physical install is account-neutral. Claiming it for a newly verified
  -- session retires older account associations and their legacy push rows.
  update private.installation_sessions set
    status = 'revoked', revoked_at = coalesce(revoked_at, pg_catalog.now())
  where installation_id = p_installation_id and session_id <> p_session_id;
  update private.account_installation_subscriptions set
    delivery_enabled = false,
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  where installation_id = p_installation_id and user_id <> p_user_id;
  update public.push_devices set
    disabled_at = coalesce(disabled_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where device_id = p_installation_id::text and user_id <> p_user_id;

  insert into private.app_installations (
    id, platform, display_name, app_version, build_number, last_seen_at
  ) values (
    p_installation_id, p_platform, nullif(pg_catalog.btrim(p_display_name), ''),
    nullif(pg_catalog.btrim(p_app_version), ''), p_build_number, pg_catalog.now()
  )
  on conflict (id) do update set
    platform = excluded.platform,
    display_name = coalesce(excluded.display_name, private.app_installations.display_name),
    app_version = coalesce(excluded.app_version, private.app_installations.app_version),
    build_number = coalesce(excluded.build_number, private.app_installations.build_number),
    last_seen_at = pg_catalog.now();

  insert into private.installation_sessions (
    installation_id, session_id, user_id, account_id, status, last_seen_at, revoked_at
  ) values (
    p_installation_id, p_session_id, p_user_id, v_account_id, 'active', pg_catalog.now(), null
  )
  on conflict (session_id) do update set
    installation_id = excluded.installation_id,
    user_id = excluded.user_id,
    account_id = excluded.account_id,
    status = 'active',
    last_seen_at = pg_catalog.now(),
    revoked_at = null;

  insert into private.account_installation_subscriptions (
    account_id, installation_id, user_id, delivery_enabled
  ) values (v_account_id, p_installation_id, p_user_id, true)
  on conflict (account_id, installation_id) do update set
    user_id = excluded.user_id,
    delivery_enabled = true,
    revoked_at = null,
    updated_at = pg_catalog.now();

  perform private.record_account_event(v_account_id, p_user_id, p_installation_id,
    'installation.bind', 'success');
  return pg_catalog.jsonb_build_object(
    'id', p_installation_id,
    'accountId', v_account_id,
    'platform', p_platform,
    'current', true,
    'revokedAt', null
  );
end;
$$;

create or replace function public.bind_account_installation(
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
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_session_id();
begin
  if v_user_id is null or v_session_id is null then raise exception 'UNAUTHORIZED'; end if;
  return public.bind_account_installation_internal(
    v_user_id, v_session_id, p_installation_id, p_platform,
    p_app_version, p_build_number, p_display_name
  );
end;
$$;

revoke all on function public.bind_account_installation_internal(uuid, uuid, uuid, text, text, integer, text)
from public, anon, authenticated;
grant execute on function public.bind_account_installation_internal(uuid, uuid, uuid, text, text, integer, text)
to service_role;
revoke all on function public.bind_account_installation(uuid, text, text, integer, text)
from public, anon, authenticated;
grant execute on function public.bind_account_installation(uuid, text, text, integer, text)
to authenticated;

create or replace function public.set_account_installation_delivery_internal(
  p_user_id uuid,
  p_installation_id uuid,
  p_delivery_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.account_installation_subscriptions as subscription
  set delivery_enabled = p_delivery_enabled, updated_at = pg_catalog.now()
  where subscription.user_id = p_user_id
    and subscription.installation_id = p_installation_id;
  return found;
end;
$$;

revoke all on function public.set_account_installation_delivery_internal(uuid, uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_account_installation_delivery_internal(uuid, uuid, boolean)
to service_role;

-- A restored account can legitimately claim the Expo token already registered
-- by the same physical installation. The installation bind above first
-- disables the previous owner's delivery; only then may this narrow helper
-- remove that stale row so the existing registration RPC can recreate it.
create or replace function public.prepare_push_token_reassignment_internal(
  p_user_id uuid,
  p_session_id uuid,
  p_installation_id uuid,
  p_expo_push_token text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.push_devices%rowtype;
begin
  if p_user_id is null or p_session_id is null or p_installation_id is null
    or p_expo_push_token is null then
    raise exception 'INVALID_DEVICE';
  end if;

  perform public.assert_account_session_active_internal(p_user_id, p_session_id);

  select device.* into v_existing
  from public.push_devices as device
  where device.expo_push_token = pg_catalog.btrim(p_expo_push_token)
  for update;

  if not found or v_existing.user_id = p_user_id then return true; end if;

  if v_existing.device_id <> p_installation_id::text
    or v_existing.disabled_at is null
    or not exists (
      select 1
      from private.installation_sessions as binding
      where binding.installation_id = p_installation_id
        and binding.session_id = p_session_id
        and binding.user_id = p_user_id
        and binding.status = 'active'
        and binding.revoked_at is null
    ) then
    raise exception 'TOKEN_CONFLICT';
  end if;

  delete from public.push_devices where id = v_existing.id;
  return true;
end;
$$;

revoke all on function public.prepare_push_token_reassignment_internal(uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.prepare_push_token_reassignment_internal(uuid, uuid, uuid, text)
to service_role;

create or replace function public.list_account_installations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_session_id();
  v_account_id uuid;
  v_result jsonb;
begin
  perform private.assert_active_zona_session();
  select owner.account_id into strict v_account_id
  from private.personal_account_owners as owner where owner.user_id = v_user_id;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', installation.id,
      'platform', installation.platform,
      'displayName', installation.display_name,
      'appVersion', installation.app_version,
      'buildNumber', installation.build_number,
      'createdAt', installation.created_at,
      'lastSeenAt', installation.last_seen_at,
      'revokedAt', subscription.revoked_at,
      'deliveryEnabled', coalesce(subscription.delivery_enabled, false),
      'current', exists (
        select 1 from private.installation_sessions as current_binding
        where current_binding.installation_id = installation.id
          and current_binding.session_id = v_session_id
          and current_binding.status = 'active'
      )
    ) order by installation.last_seen_at desc
  ), '[]'::jsonb)
  into v_result
  from private.app_installations as installation
  left join private.account_installation_subscriptions as subscription
    on subscription.account_id = v_account_id
   and subscription.installation_id = installation.id
  where subscription.account_id = v_account_id
    and subscription.user_id = v_user_id;
  return v_result;
end;
$$;

revoke all on function public.list_account_installations() from public, anon, authenticated;
grant execute on function public.list_account_installations() to authenticated;

create or replace function public.revoke_account_installation_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_installation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_target private.account_installation_subscriptions%rowtype;
begin
  if p_user_id is null or p_actor_session_id is null or p_installation_id is null then
    raise exception 'INVALID_INSTALLATION';
  end if;
  select owner.account_id into strict v_account_id
  from private.personal_account_owners as owner where owner.user_id = p_user_id;
  if not exists (
    select 1 from auth.sessions as auth_session
    where auth_session.id = p_actor_session_id and auth_session.user_id = p_user_id
  ) then raise exception 'INVALID_SESSION'; end if;
  if exists (
    select 1 from private.installation_sessions as binding
    where binding.installation_id = p_installation_id
      and binding.session_id = p_actor_session_id
      and binding.status = 'active'
  ) then raise exception 'CURRENT_INSTALLATION'; end if;

  select subscription.* into v_target
  from private.account_installation_subscriptions as subscription
  where subscription.installation_id = p_installation_id
    and subscription.account_id = v_account_id
    and subscription.user_id = p_user_id
  for update;
  if not found then raise exception 'INSTALLATION_NOT_FOUND'; end if;

  update private.installation_sessions
  set status = 'revoked', revoked_at = coalesce(revoked_at, pg_catalog.now()), last_seen_at = pg_catalog.now()
  where installation_id = p_installation_id;
  update private.account_installation_subscriptions
  set delivery_enabled = false, revoked_at = coalesce(revoked_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where account_id = v_account_id and installation_id = p_installation_id;
  update public.push_devices
  set disabled_at = coalesce(disabled_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where user_id = p_user_id and device_id = p_installation_id::text;

  perform private.record_account_event(v_account_id, p_user_id, p_installation_id,
    'installation.revoke', 'success');
  return pg_catalog.jsonb_build_object(
    'id', p_installation_id, 'revoked', true, 'deliveryEnabled', false
  );
end;
$$;

create or replace function public.revoke_account_installation(p_installation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_session_id();
begin
  perform private.assert_active_zona_session();
  return public.revoke_account_installation_internal(v_user_id, v_session_id, p_installation_id);
end;
$$;

revoke all on function public.revoke_account_installation_internal(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.revoke_account_installation_internal(uuid, uuid, uuid) to service_role;
revoke all on function public.revoke_account_installation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_account_installation(uuid) to authenticated;

create or replace function public.begin_account_deletion_internal(
  p_user_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_job private.account_deletion_jobs%rowtype;
begin
  if p_user_id is null or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 8 and 160 then
    raise exception 'INVALID_DELETE_REQUEST';
  end if;
  v_account_id := private.ensure_personal_account(p_user_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:account:' || v_account_id::text, 0)
  );

  insert into private.account_deletion_jobs (
    idempotency_key, account_id_snapshot, user_id_snapshot, status, attempt_count
  ) values (p_idempotency_key, v_account_id, p_user_id, 'running', 1)
  on conflict (idempotency_key) do update set
    status = case when private.account_deletion_jobs.status = 'completed'
      then 'completed' else 'running' end,
    attempt_count = private.account_deletion_jobs.attempt_count + 1,
    error_code = null,
    updated_at = pg_catalog.now()
  returning * into v_job;

  if v_job.user_id_snapshot <> p_user_id or v_job.account_id_snapshot <> v_account_id then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  update private.accounts
  set status = case when status = 'deleted' then 'deleted' else 'deleting' end,
      deletion_requested_at = coalesce(deletion_requested_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = v_account_id;

  update public.api_keys set
    is_active = false,
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  where user_id = p_user_id;
  update public.sources set revoked_at = coalesce(revoked_at, pg_catalog.now())
  where user_id = p_user_id;
  update private.installation_sessions set
    status = 'revoked', revoked_at = coalesce(revoked_at, pg_catalog.now())
  where user_id = p_user_id;
  update private.account_installation_subscriptions set
    delivery_enabled = false, updated_at = pg_catalog.now()
  where user_id = p_user_id;
  update public.push_devices set
    disabled_at = coalesce(disabled_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where user_id = p_user_id;

  perform private.record_account_event(v_account_id, p_user_id, null,
    'account.delete_begin', 'success', pg_catalog.jsonb_build_object('jobId', v_job.id));
  return pg_catalog.jsonb_build_object(
    'jobId', v_job.id,
    'accountId', v_account_id,
    'status', v_job.status,
    'completed', v_job.status = 'completed'
  );
end;
$$;

create or replace function public.complete_account_deletion_internal(
  p_job_id uuid,
  p_account_id uuid,
  p_user_id uuid,
  p_cleanup jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job_id is null or p_account_id is null or p_user_id is null
    or p_cleanup is null or pg_catalog.jsonb_typeof(p_cleanup) <> 'object'
    or pg_catalog.octet_length(p_cleanup::text) > 8192 then
    raise exception 'INVALID_DELETE_COMPLETION';
  end if;
  update private.account_deletion_jobs
  set status = 'completed', cleanup = p_cleanup, error_code = null,
      completed_at = coalesce(completed_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where id = p_job_id and account_id_snapshot = p_account_id and user_id_snapshot = p_user_id;
  if not found then raise exception 'DELETE_JOB_NOT_FOUND'; end if;
  update private.accounts
  set status = 'deleted', updated_at = pg_catalog.now()
  where id = p_account_id;
  delete from public.account_profiles where account_id = p_account_id;
  insert into private.account_auth_events (
    account_id, user_id, event_type, result, context
  ) values (
    p_account_id, p_user_id, 'account.delete_complete', 'success',
    pg_catalog.jsonb_build_object('jobId', p_job_id)
  );
  return pg_catalog.jsonb_build_object('jobId', p_job_id, 'status', 'completed');
end;
$$;

create or replace function public.mark_account_deletion_data_deleted_internal(
  p_job_id uuid,
  p_account_id uuid,
  p_user_id uuid,
  p_cleanup jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job_id is null or p_account_id is null or p_user_id is null
    or p_cleanup is null or pg_catalog.jsonb_typeof(p_cleanup) <> 'object'
    or pg_catalog.octet_length(p_cleanup::text) > 8192 then
    raise exception 'INVALID_DELETE_CHECKPOINT';
  end if;
  update private.account_deletion_jobs
  set status = 'data_deleted', cleanup = p_cleanup, error_code = null,
      updated_at = pg_catalog.now()
  where id = p_job_id and account_id_snapshot = p_account_id
    and user_id_snapshot = p_user_id and status <> 'completed';
  if not found and not exists (
    select 1 from private.account_deletion_jobs as job
    where job.id = p_job_id and job.status = 'completed'
  ) then raise exception 'DELETE_JOB_NOT_FOUND'; end if;
  return pg_catalog.jsonb_build_object('jobId', p_job_id, 'status', 'data_deleted');
end;
$$;

create or replace function public.claim_account_deletion_jobs_internal(p_limit integer default 10)
returns table (
  job_id uuid,
  account_id uuid,
  user_id uuid,
  job_status text,
  cleanup jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'INVALID_LIMIT';
  end if;
  return query
  with candidates as (
    select job.id
    from private.account_deletion_jobs as job
    where job.status in ('pending', 'running', 'data_deleted', 'failed')
      and job.updated_at < pg_catalog.now() - interval '1 minute'
    order by job.updated_at
    limit p_limit
    for update skip locked
  ), bumped as (
    update private.account_deletion_jobs as job
    set attempt_count = job.attempt_count + 1,
        updated_at = pg_catalog.now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select bumped.id, bumped.account_id_snapshot, bumped.user_id_snapshot,
    bumped.status, bumped.cleanup
  from bumped;
end;
$$;

create or replace function public.fail_account_deletion_internal(
  p_job_id uuid,
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.account_deletion_jobs
  set status = case when status = 'data_deleted' then 'data_deleted' else 'failed' end,
      error_code = case
        when p_error_code ~ '^[A-Z][A-Z0-9_]{1,79}$' then p_error_code else 'INTERNAL_ERROR' end,
      updated_at = pg_catalog.now()
  where id = p_job_id and status <> 'completed';
end;
$$;

revoke all on function public.begin_account_deletion_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_account_deletion_data_deleted_internal(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_account_deletion_jobs_internal(integer) from public, anon, authenticated;
revoke all on function public.complete_account_deletion_internal(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_account_deletion_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_account_deletion_internal(uuid, text) to service_role;
grant execute on function public.mark_account_deletion_data_deleted_internal(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.claim_account_deletion_jobs_internal(integer) to service_role;
grant execute on function public.complete_account_deletion_internal(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_account_deletion_internal(uuid, text) to service_role;

create or replace function public.get_account_deletion_status_internal(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.account_deletion_jobs%rowtype;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  select job.* into v_job from private.account_deletion_jobs as job
  where job.user_id_snapshot = p_user_id order by job.created_at desc limit 1;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'jobId', v_job.id, 'status', v_job.status,
    'requestedAt', v_job.created_at, 'updatedAt', v_job.updated_at,
    'completedAt', v_job.completed_at, 'errorCode', v_job.error_code
  );
end;
$$;

revoke all on function public.get_account_deletion_status_internal(uuid) from public, anon, authenticated;
grant execute on function public.get_account_deletion_status_internal(uuid) to service_role;

-- Reserved transfer contract. No grants and no ownership writes until the
-- Storage copy/verification/rollback worker exists and the feature flag opens.
create or replace function public.begin_account_transfer()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'FEATURE_DISABLED'; end; $$;
create or replace function public.preview_account_transfer(p_transfer_id uuid, p_challenge text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'FEATURE_DISABLED'; end; $$;
create or replace function public.commit_account_transfer(p_transfer_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'FEATURE_DISABLED'; end; $$;
revoke all on function public.begin_account_transfer() from public, anon, authenticated;
revoke all on function public.preview_account_transfer(uuid, text) from public, anon, authenticated;
revoke all on function public.commit_account_transfer(uuid, text) from public, anon, authenticated;

-- Same signature and response fields as v0.0.5-v0.0.7, expanded so the
-- tombstoned account is independent of source/key existence.
create or replace function public.delete_account_data_internal(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifications integer := 0;
  v_devices integer := 0;
  v_sources integer := 0;
  v_api_keys integer := 0;
  v_credentials integer := 0;
  v_options integer := 0;
  v_rate_events integer := 0;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:account:' || p_user_id::text, 0)
  );

  select pg_catalog.count(*) into v_api_keys
  from public.api_keys as access_key where access_key.user_id = p_user_id;
  select pg_catalog.count(*) into v_credentials
  from private.source_credentials as credential
  join public.sources as source on source.id = credential.source_id
  where source.user_id = p_user_id;

  update public.api_keys set is_active = false,
    revoked_at = coalesce(revoked_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where user_id = p_user_id;
  update public.sources set revoked_at = coalesce(revoked_at, pg_catalog.now())
  where user_id = p_user_id;
  update private.installation_sessions set status = 'revoked',
    revoked_at = coalesce(revoked_at, pg_catalog.now()) where user_id = p_user_id;
  update private.account_installation_subscriptions set delivery_enabled = false,
    updated_at = pg_catalog.now() where user_id = p_user_id;

  delete from private.client_event_logs where user_id = p_user_id;
  delete from private.server_event_logs where user_id = p_user_id;
  delete from private.daily_usage_stats where user_id = p_user_id;
  delete from private.account_entitlements where user_id = p_user_id;

  delete from public.notifications where user_id = p_user_id;
  get diagnostics v_notifications = row_count;
  delete from public.push_devices where user_id = p_user_id;
  get diagnostics v_devices = row_count;
  delete from public.app_options where user_id = p_user_id;
  get diagnostics v_options = row_count;
  delete from public.sources where user_id = p_user_id;
  get diagnostics v_sources = row_count;
  delete from private.account_rate_events where user_id = p_user_id;
  get diagnostics v_rate_events = row_count;
  delete from private.account_installation_subscriptions where user_id = p_user_id;
  delete from private.installation_sessions where user_id = p_user_id;
  delete from private.app_installations as installation
  where not exists (
    select 1 from private.account_installation_subscriptions as subscription
    where subscription.installation_id = installation.id
  ) and not exists (
    select 1 from private.installation_sessions as binding
    where binding.installation_id = installation.id
  );
  delete from public.user_profiles where user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'notifications', v_notifications,
    'pushDevices', v_devices,
    'sources', v_sources,
    'apiKeys', v_api_keys,
    'sourceCredentials', v_credentials,
    'appOptions', v_options,
    'rateEvents', v_rate_events
  );
end;
$$;

revoke all on function public.delete_account_data_internal(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data_internal(uuid) to service_role;

-- Keep the direct owner RPCs usable by old builds, but make their first action
-- the same account/session gate used by RLS. Renaming retains the tested bodies.
alter function public.create_source(text, text, text, text)
rename to create_source_legacy_body_v0_0_8;
revoke all on function public.create_source_legacy_body_v0_0_8(text, text, text, text)
from public, anon, authenticated;
create function public.create_source(
  p_display_name text, p_hostname text, p_token_hash text, p_key_prefix text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_personal_account((select auth.uid()));
  perform private.assert_active_zona_session();
  return public.create_source_legacy_body_v0_0_8(
    p_display_name, p_hostname, p_token_hash, p_key_prefix
  );
end; $$;

alter function public.manage_source(uuid, text, text, boolean)
rename to manage_source_legacy_body_v0_0_8;
revoke all on function public.manage_source_legacy_body_v0_0_8(uuid, text, text, boolean)
from public, anon, authenticated;
create function public.manage_source(
  p_source_id uuid, p_action text, p_display_name text default null,
  p_is_active boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_active_zona_session();
  return public.manage_source_legacy_body_v0_0_8(
    p_source_id, p_action, p_display_name, p_is_active
  );
end; $$;

alter function public.get_user_notification_preferences()
rename to get_user_notification_preferences_legacy_body_v0_0_8;
revoke all on function public.get_user_notification_preferences_legacy_body_v0_0_8()
from public, anon, authenticated;
create function public.get_user_notification_preferences()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
return public.get_user_notification_preferences_legacy_body_v0_0_8(); end; $$;

alter function public.update_user_notification_preferences(boolean, boolean, boolean, boolean)
rename to update_user_notification_preferences_legacy_body_v0_0_8;
revoke all on function public.update_user_notification_preferences_legacy_body_v0_0_8(boolean, boolean, boolean, boolean)
from public, anon, authenticated;
create function public.update_user_notification_preferences(
  p_push_enabled boolean default null, p_play_sound boolean default null,
  p_show_preview boolean default null, p_live_activity_enabled boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
return public.update_user_notification_preferences_legacy_body_v0_0_8(
  p_push_enabled, p_play_sound, p_show_preview, p_live_activity_enabled
); end; $$;

alter function public.update_source_notification_sound(uuid, text)
rename to update_source_notification_sound_legacy_body_v0_0_8;
revoke all on function public.update_source_notification_sound_legacy_body_v0_0_8(uuid, text)
from public, anon, authenticated;
create function public.update_source_notification_sound(p_access_key_id uuid, p_sound_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
return public.update_source_notification_sound_legacy_body_v0_0_8(p_access_key_id, p_sound_name); end; $$;

alter function public.mark_inbox_notification_read(uuid, timestamptz)
rename to mark_inbox_notification_read_legacy_body_v0_0_8;
revoke all on function public.mark_inbox_notification_read_legacy_body_v0_0_8(uuid, timestamptz)
from public, anon, authenticated;
create function public.mark_inbox_notification_read(p_notification_id uuid, p_read_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
return public.mark_inbox_notification_read_legacy_body_v0_0_8(p_notification_id, p_read_at); end; $$;

alter function public.mark_all_inbox_notifications_read(timestamptz)
rename to mark_all_inbox_notifications_read_legacy_body_v0_0_8;
revoke all on function public.mark_all_inbox_notifications_read_legacy_body_v0_0_8(timestamptz)
from public, anon, authenticated;
create function public.mark_all_inbox_notifications_read(p_read_at timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
return public.mark_all_inbox_notifications_read_legacy_body_v0_0_8(p_read_at); end; $$;

alter function public.delete_inbox_notification(uuid)
rename to delete_inbox_notification_legacy_body_v0_0_8;
revoke all on function public.delete_inbox_notification_legacy_body_v0_0_8(uuid)
from public, anon, authenticated;
create function public.delete_inbox_notification(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
return public.delete_inbox_notification_legacy_body_v0_0_8(p_notification_id); end; $$;

alter function public.get_app_bootstrap(text, text, integer, text, text, text)
rename to get_app_bootstrap_legacy_body_v0_0_8;
revoke all on function public.get_app_bootstrap_legacy_body_v0_0_8(text, text, integer, text, text, text)
from public, anon, authenticated;
create function public.get_app_bootstrap(
  p_platform text, p_app_version text, p_build_number integer,
  p_release_channel text, p_locale text, p_installation_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_personal_account((select auth.uid()));
  perform private.assert_active_zona_session();
  return public.get_app_bootstrap_legacy_body_v0_0_8(
    p_platform, p_app_version, p_build_number, p_release_channel, p_locale, p_installation_id
  );
end; $$;

alter function public.record_client_event(text, text, text, text, text, integer, text, jsonb)
rename to record_client_event_legacy_body_v0_0_8;
revoke all on function public.record_client_event_legacy_body_v0_0_8(text, text, text, text, text, integer, text, jsonb)
from public, anon, authenticated;
create function public.record_client_event(
  p_installation_id text, p_event_name text, p_level text, p_message text,
  p_app_version text, p_build_number integer, p_platform text,
  p_context jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin perform private.assert_active_zona_session();
perform public.record_client_event_legacy_body_v0_0_8(
  p_installation_id, p_event_name, p_level, p_message,
  p_app_version, p_build_number, p_platform, p_context
); end; $$;

revoke all on function public.create_source(text, text, text, text) from public, anon, authenticated;
revoke all on function public.manage_source(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.get_user_notification_preferences() from public, anon, authenticated;
revoke all on function public.update_user_notification_preferences(boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.update_source_notification_sound(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_inbox_notification_read(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_all_inbox_notifications_read(timestamptz) from public, anon, authenticated;
revoke all on function public.delete_inbox_notification(uuid) from public, anon, authenticated;
revoke all on function public.get_app_bootstrap(text, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.record_client_event(text, text, text, text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_source(text, text, text, text) to authenticated;
grant execute on function public.manage_source(uuid, text, text, boolean) to authenticated;
grant execute on function public.get_user_notification_preferences() to authenticated;
grant execute on function public.update_user_notification_preferences(boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_source_notification_sound(uuid, text) to authenticated;
grant execute on function public.mark_inbox_notification_read(uuid, timestamptz) to authenticated;
grant execute on function public.mark_all_inbox_notifications_read(timestamptz) to authenticated;
grant execute on function public.delete_inbox_notification(uuid) to authenticated;
grant execute on function public.get_app_bootstrap(text, text, integer, text, text, text) to authenticated;
grant execute on function public.record_client_event(text, text, text, text, text, integer, text, jsonb) to authenticated;

-- Old builds already have a stable UUID installation ID in push_devices, but
-- no Auth session binding. Backfill the visible installation/subscription and
-- let the next authenticated launch attach session_id.
insert into private.app_installations (
  id, platform, created_at, last_seen_at
)
select
  device.device_id::uuid,
  device.platform,
  device.created_at,
  device.updated_at
from public.push_devices as device
where device.device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
order by device.device_id::uuid, device.updated_at desc
on conflict (id) do nothing;

insert into private.account_installation_subscriptions (
  account_id, installation_id, user_id, delivery_enabled, created_at, updated_at
)
select
  owner.account_id,
  installation.id,
  device.user_id,
  device.disabled_at is null,
  device.created_at,
  device.updated_at
from public.push_devices as device
join private.app_installations as installation on installation.id = device.device_id::uuid
join private.personal_account_owners as owner on owner.user_id = device.user_id
where device.device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (account_id, installation_id) do nothing;

create or replace function private.current_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v_session text := (select auth.jwt() ->> 'session_id');
begin
  if v_session is null or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_session::uuid;
end;
$$;

revoke all on function private.current_session_id() from public, anon, authenticated;

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
      on membership.account_id = account.id
     and membership.user_id = v_user_id
     and membership.status = 'active'
    where auth_session.id = v_session_id
      and auth_session.user_id = v_user_id
      and account.status = 'active'
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

create or replace function public.request_can_access_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.request_has_active_zona_session()
    and exists (
      select 1 from private.account_memberships as membership
      where membership.account_id = p_account_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function public.request_can_access_account(uuid) from public, anon, authenticated;
grant execute on function public.request_can_access_account(uuid) to authenticated;

create policy "Members read their account profile"
on public.account_profiles for select to authenticated
using (
  public.request_can_access_account(account_profiles.account_id)
);

create policy "Users read their user profile"
on public.user_profiles for select to authenticated
using (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()));

create policy "Users update their user profile"
on public.user_profiles for update to authenticated
using (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()))
with check (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()));

grant select on public.account_profiles to authenticated;
grant select, update (display_name, locale, timezone, updated_at) on public.user_profiles to authenticated;

-- Preserve the legacy owner model while adding account/session lifecycle
-- denial. Unbound sessions are temporarily accepted for v0.0.5-v0.0.7.
drop policy if exists "Users read their sources" on public.sources;
create policy "Users read their sources"
on public.sources for select to authenticated
using (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()));

drop policy if exists "Users read unexpired notifications" on public.notifications;
create policy "Users read unexpired notifications"
on public.notifications for select to authenticated
using (
  user_id = (select auth.uid())
  and expires_at > pg_catalog.now()
  and (select public.request_has_active_zona_session())
);

drop policy if exists "Users mark their notifications read" on public.notifications;
create policy "Users mark their notifications read"
on public.notifications for update to authenticated
using (
  user_id = (select auth.uid())
  and expires_at > pg_catalog.now()
  and (select public.request_has_active_zona_session())
)
with check (
  user_id = (select auth.uid())
  and expires_at > pg_catalog.now()
  and (select public.request_has_active_zona_session())
);

drop policy if exists "Users delete their notifications" on public.notifications;
create policy "Users delete their notifications"
on public.notifications for delete to authenticated
using (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()));

drop policy if exists "Users manage their app options" on public.app_options;
create policy "Users manage their app options"
on public.app_options for all to authenticated
using (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()))
with check (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()));

drop policy if exists "Users read their API keys" on public.api_keys;
create policy "Users read their API keys"
on public.api_keys for select to authenticated
using (user_id = (select auth.uid()) and (select public.request_has_active_zona_session()));

drop policy if exists "Users update their API key sound" on public.api_keys;
create policy "Users update their API key sound"
on public.api_keys for update to authenticated
using (
  user_id = (select auth.uid())
  and revoked_at is null
  and (select public.request_has_active_zona_session())
)
with check (
  user_id = (select auth.uid())
  and revoked_at is null
  and (select public.request_has_active_zona_session())
);

drop policy if exists "Owners read their notification attachments" on storage.objects;
create policy "Owners read their notification attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'notification-attachments'
  and (select auth.uid())::text = (storage.foldername(name))[1]
  and (select public.request_has_active_zona_session())
);

drop policy if exists "Owners delete their notification attachments" on storage.objects;
create policy "Owners delete their notification attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'notification-attachments'
  and (select auth.uid())::text = (storage.foldername(name))[1]
  and (select public.request_has_active_zona_session())
);

drop policy if exists "Users receive their Zona data broadcasts" on realtime.messages;
create policy "Users receive their Zona data broadcasts"
on realtime.messages for select to authenticated
using (
  (select public.request_has_active_zona_session())
  and (select realtime.topic()) in (
    'zona:config',
    'zona:config:' || (select auth.uid())::text,
    'zona:inbox:' || (select auth.uid())::text,
    'zona:live:' || (select auth.uid())::text
  )
);

create or replace function private.assert_active_zona_session()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.request_has_active_zona_session() then
    raise exception 'UNAUTHORIZED';
  end if;
end;
$$;

revoke all on function private.assert_active_zona_session() from public, anon, authenticated;

-- Prevent source-token ingestion and source creation after an account enters
-- transfer/deletion lifecycle states, including service-role code paths.
create or replace function private.enforce_insert_owner_account_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from private.personal_account_owners as owner
    join private.accounts as account on account.id = owner.account_id
    where owner.user_id = new.user_id and account.status = 'active'
  ) then
    raise exception 'ACCOUNT_INACTIVE';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_insert_owner_account_active() from public, anon, authenticated;

create trigger sources_require_active_account
before insert on public.sources
for each row execute function private.enforce_insert_owner_account_active();

create trigger api_keys_require_active_account
before insert on public.api_keys
for each row execute function private.enforce_insert_owner_account_active();

create trigger notifications_require_active_account
before insert on public.notifications
for each row execute function private.enforce_insert_owner_account_active();

-- The live project previously contained this dashboard-created helper. It is
-- absent in local histories, so revoke it only when present.
do $$
declare v_identity text;
begin
  select p.oid::regprocedure::text into v_identity
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  limit 1;
  if v_identity is not null then
    execute 'revoke all on function ' || v_identity || ' from public, anon, authenticated';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from auth.users as auth_user
    where not exists (
      select 1
      from private.personal_account_owners as owner
      join private.account_memberships as membership
        on membership.account_id = owner.account_id
       and membership.user_id = owner.user_id
       and membership.role = 'owner'
       and membership.status = 'active'
      where owner.user_id = auth_user.id
    )
  ) then raise exception 'ACCOUNT_BACKFILL_INCOMPLETE'; end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('account_profiles', 'user_profiles')
      and not relation.relrowsecurity
  ) then raise exception 'ACCOUNT_RLS_INCOMPLETE'; end if;
end;
$$;
