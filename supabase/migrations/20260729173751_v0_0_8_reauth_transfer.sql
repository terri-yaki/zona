-- v0.0.8 recent-reauthentication grants and resumable guest transfer.
-- Legacy user_id columns remain populated so v0.0.5-v0.0.7 clients continue
-- to use their existing RLS policies while account_id becomes transferable.

alter table public.sources add column account_id uuid references private.accounts(id) on delete restrict;
alter table public.notifications add column account_id uuid references private.accounts(id) on delete restrict;
alter table public.api_keys add column account_id uuid references private.accounts(id) on delete restrict;
alter table public.push_devices add column account_id uuid references private.accounts(id) on delete restrict;
alter table public.app_options add column account_id uuid references private.accounts(id) on delete restrict;
alter table private.ingest_requests add column account_id uuid references private.accounts(id) on delete restrict;

update public.sources as resource set account_id = owner.account_id
from private.personal_account_owners as owner where owner.user_id = resource.user_id;
update public.notifications as resource set account_id = owner.account_id
from private.personal_account_owners as owner where owner.user_id = resource.user_id;
update public.api_keys as resource set account_id = owner.account_id
from private.personal_account_owners as owner where owner.user_id = resource.user_id;
update public.push_devices as resource set account_id = owner.account_id
from private.personal_account_owners as owner where owner.user_id = resource.user_id;
update public.app_options as resource set account_id = owner.account_id
from private.personal_account_owners as owner where owner.user_id = resource.user_id;
update private.ingest_requests as resource set account_id = owner.account_id
from private.personal_account_owners as owner where owner.user_id = resource.user_id;

alter table public.sources alter column account_id set not null;
alter table public.notifications alter column account_id set not null;
alter table public.api_keys alter column account_id set not null;
alter table public.push_devices alter column account_id set not null;
alter table public.app_options alter column account_id set not null;
alter table private.ingest_requests alter column account_id set not null;

create index sources_account_created_idx on public.sources (account_id, created_at desc);
create index notifications_account_created_idx on public.notifications (account_id, created_at desc);
create index api_keys_account_created_idx on public.api_keys (account_id, created_at desc);
create index push_devices_account_idx on public.push_devices (account_id, updated_at desc);
create index ingest_requests_account_rate_idx on private.ingest_requests (account_id, requested_at desc);

-- Ownership is changed as one transaction. Deferring these reviewed composite
-- constraints prevents a half-updated parent/child graph from being observable.
alter table public.notifications drop constraint notifications_source_owner_fkey;
alter table public.notifications add constraint notifications_source_owner_fkey
  foreign key (source_id, user_id) references public.sources(id, user_id)
  on delete restrict deferrable initially immediate;
alter table private.ingest_requests drop constraint ingest_requests_source_owner_fkey;
alter table private.ingest_requests add constraint ingest_requests_source_owner_fkey
  foreign key (source_id, user_id) references public.sources(id, user_id)
  on delete cascade deferrable initially immediate;
alter table public.api_keys drop constraint api_keys_source_owner_fkey;
alter table public.api_keys add constraint api_keys_source_owner_fkey
  foreign key (source_id, user_id) references public.sources(id, user_id)
  on delete cascade deferrable initially immediate;

create table private.account_reauth_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references private.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_session_id uuid not null,
  proof_session_id uuid not null,
  proof_identity_id uuid not null,
  installation_id uuid references private.app_installations(id) on delete set null,
  action text not null check (action in (
    'account.delete', 'identity.link', 'identity.unlink', 'installation.revoke',
    'sessions.revoke.others', 'sessions.revoke.all'
  )),
  target text not null default '' check (char_length(target) <= 200),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check (proof_session_id <> actor_session_id),
  check (expires_at <= created_at + interval '10 minutes'),
  unique (proof_session_id, action, target)
);

create index account_reauth_grants_expiry_idx
on private.account_reauth_grants (expires_at) where used_at is null;

revoke all on private.account_reauth_grants from public, anon, authenticated;

create table private.auth_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete cascade,
  expected_user_id uuid references auth.users(id) on delete cascade,
  actor_session_id uuid,
  installation_id uuid,
  intent text not null check (intent in ('link_method', 'protect_guest', 'sign_in', 'sign_up')),
  provider text not null check (provider in ('email', 'apple', 'google', 'github')),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at <= created_at + interval '10 minutes'),
  check ((intent in ('link_method', 'protect_guest')) = (expected_user_id is not null))
);

create index auth_transactions_expiry_idx on private.auth_transactions (expires_at)
where used_at is null and cancelled_at is null;
revoke all on private.auth_transactions from public, anon, authenticated;

create or replace function public.begin_auth_transaction_internal(
  p_actor_user_id uuid,
  p_actor_session_id uuid,
  p_installation_id uuid,
  p_intent text,
  p_provider text,
  p_state_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row private.auth_transactions%rowtype;
begin
  if p_intent not in ('link_method', 'protect_guest', 'sign_in', 'sign_up')
    or p_provider not in ('email', 'apple', 'google', 'github')
    or p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$'
    or p_installation_id is null then raise exception 'INVALID_AUTH_TRANSACTION'; end if;
  if p_intent in ('link_method', 'protect_guest') then
    if p_actor_user_id is null or p_actor_session_id is null then raise exception 'UNAUTHORIZED'; end if;
    perform public.assert_account_session_active_internal(p_actor_user_id, p_actor_session_id);
    if not exists (select 1 from private.installation_sessions as binding
      where binding.user_id = p_actor_user_id
        and binding.session_id = p_actor_session_id
        and binding.installation_id = p_installation_id
        and binding.status = 'active' and binding.revoked_at is null) then
      raise exception 'INVALID_INSTALLATION';
    end if;
  elsif p_actor_user_id is not null and p_actor_session_id is not null then
    perform public.assert_account_session_active_internal(p_actor_user_id, p_actor_session_id);
  end if;

  insert into private.auth_transactions (
    actor_user_id, expected_user_id, actor_session_id, installation_id,
    intent, provider, state_hash, expires_at
  ) values (
    p_actor_user_id,
    case when p_intent in ('link_method', 'protect_guest') then p_actor_user_id else null end,
    p_actor_session_id, p_installation_id, p_intent, p_provider,
    p_state_hash, pg_catalog.now() + interval '10 minutes'
  ) returning * into v_row;
  return pg_catalog.jsonb_build_object(
    'id', v_row.id, 'expiresAt', v_row.expires_at,
    'intent', v_row.intent, 'provider', v_row.provider
  );
end;
$$;

create or replace function public.consume_auth_transaction_internal(
  p_transaction_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_installation_id uuid,
  p_state_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row private.auth_transactions%rowtype;
begin
  perform public.assert_account_session_active_internal(p_user_id, p_session_id);
  select transaction.* into v_row from private.auth_transactions as transaction
  where transaction.id = p_transaction_id and transaction.state_hash = p_state_hash
  for update;
  if not found or v_row.installation_id <> p_installation_id
    or v_row.used_at is not null or v_row.cancelled_at is not null
    or v_row.expires_at <= pg_catalog.now() then raise exception 'AUTH_TRANSACTION_EXPIRED'; end if;
  if v_row.expected_user_id is not null and v_row.expected_user_id <> p_user_id then
    raise exception 'AUTH_TRANSACTION_IDENTITY_CONFLICT';
  end if;
  update private.auth_transactions set used_at = pg_catalog.now() where id = v_row.id;
  return pg_catalog.jsonb_build_object(
    'id', v_row.id, 'intent', v_row.intent, 'provider', v_row.provider,
    'installationId', v_row.installation_id, 'usedAt', pg_catalog.now()
  );
end;
$$;

create or replace function public.cancel_auth_transaction_internal(
  p_transaction_id uuid,
  p_state_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.auth_transactions set cancelled_at = pg_catalog.now()
  where id = p_transaction_id and state_hash = p_state_hash
    and used_at is null and cancelled_at is null;
  return found;
end;
$$;

revoke all on function public.begin_auth_transaction_internal(uuid, uuid, uuid, text, text, text)
from public, anon, authenticated;
revoke all on function public.consume_auth_transaction_internal(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.cancel_auth_transaction_internal(uuid, text)
from public, anon, authenticated;
grant execute on function public.begin_auth_transaction_internal(uuid, uuid, uuid, text, text, text),
  public.consume_auth_transaction_internal(uuid, uuid, uuid, uuid, text),
  public.cancel_auth_transaction_internal(uuid, text)
to service_role;

create or replace function public.issue_account_reauth_grant_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_proof_session_id uuid,
  p_proof_identity_id uuid,
  p_installation_id uuid,
  p_action text,
  p_target text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_token text;
  v_grant private.account_reauth_grants%rowtype;
begin
  if p_user_id is null or p_actor_session_id is null or p_proof_session_id is null
    or p_proof_identity_id is null
    or p_actor_session_id = p_proof_session_id
    or p_action not in ('account.delete', 'identity.link', 'identity.unlink', 'installation.revoke',
      'sessions.revoke.others', 'sessions.revoke.all')
    or p_target is null or char_length(p_target) > 200 then
    raise exception 'INVALID_REAUTH_REQUEST';
  end if;

  v_account_id := public.assert_account_session_active_internal(p_user_id, p_actor_session_id);
  if exists (select 1 from auth.users as auth_user
    where auth_user.id = p_user_id and coalesce(auth_user.is_anonymous, false)) then
    raise exception 'REAUTH_NOT_AVAILABLE';
  end if;
  if not exists (select 1 from auth.sessions as auth_session
    where auth_session.id = p_actor_session_id and auth_session.user_id = p_user_id) then
    raise exception 'INVALID_SESSION';
  end if;
  if not exists (select 1 from auth.sessions as auth_session
    where auth_session.id = p_proof_session_id and auth_session.user_id = p_user_id
      and auth_session.created_at >= pg_catalog.now() - interval '10 minutes') then
    raise exception 'FRESH_PROOF_REQUIRED';
  end if;
  if not exists (select 1 from auth.identities as identity
    where identity.id = p_proof_identity_id and identity.user_id = p_user_id
      and identity.last_sign_in_at >= pg_catalog.now() - interval '10 minutes')
    or (p_action = 'identity.unlink' and p_target = p_proof_identity_id::text) then
    raise exception 'REMAINING_IDENTITY_PROOF_REQUIRED';
  end if;
  if p_installation_id is not null and not exists (
    select 1 from private.installation_sessions as binding
    where binding.user_id = p_user_id
      and binding.session_id = p_actor_session_id
      and binding.installation_id = p_installation_id
      and binding.status = 'active' and binding.revoked_at is null
  ) then raise exception 'INVALID_INSTALLATION'; end if;

  v_token := 'zona_reauth_' || pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text, 'UTF8'),
      'sha256'
    ), 'hex'
  );
  insert into private.account_reauth_grants (
    account_id, user_id, actor_session_id, proof_session_id,
    proof_identity_id, installation_id, action, target, token_hash, expires_at
  ) values (
    v_account_id, p_user_id, p_actor_session_id, p_proof_session_id,
    p_proof_identity_id, p_installation_id, p_action, p_target,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    pg_catalog.now() + interval '10 minutes'
  )
  on conflict (proof_session_id, action, target) do update set
    actor_session_id = excluded.actor_session_id,
    proof_identity_id = excluded.proof_identity_id,
    installation_id = excluded.installation_id,
    token_hash = excluded.token_hash,
    expires_at = excluded.expires_at,
    used_at = null,
    created_at = pg_catalog.now()
  returning * into v_grant;

  perform private.record_account_event(v_account_id, p_user_id, p_installation_id,
    'reauth.grant', 'success',
    pg_catalog.jsonb_build_object('action', p_action));
  return pg_catalog.jsonb_build_object(
    'grant', v_token,
    'expiresAt', v_grant.expires_at,
    'action', v_grant.action,
    'target', v_grant.target
  );
end;
$$;

create or replace function public.consume_account_reauth_grant_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_action text,
  p_target text,
  p_grant text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_grant private.account_reauth_grants%rowtype;
begin
  if p_grant is null or char_length(p_grant) not between 32 and 200 then
    raise exception 'REAUTH_REQUIRED';
  end if;
  perform public.assert_account_session_active_internal(p_user_id, p_actor_session_id);
  select grant_row.* into v_grant
  from private.account_reauth_grants as grant_row
  where grant_row.token_hash = pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(p_grant, 'UTF8'), 'sha256'), 'hex')
    and grant_row.user_id = p_user_id
    and grant_row.actor_session_id = p_actor_session_id
    and grant_row.action = p_action
    and grant_row.target = coalesce(p_target, '')
  for update;
  if not found or v_grant.used_at is not null or v_grant.expires_at <= pg_catalog.now() then
    raise exception 'REAUTH_REQUIRED';
  end if;
  update private.account_reauth_grants set used_at = pg_catalog.now()
  where id = v_grant.id;
  perform private.record_account_event(v_grant.account_id, p_user_id,
    v_grant.installation_id, 'reauth.consume', 'success',
    pg_catalog.jsonb_build_object('action', p_action));
  return v_grant.id;
end;
$$;

revoke all on function public.issue_account_reauth_grant_internal(uuid, uuid, uuid, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.issue_account_reauth_grant_internal(uuid, uuid, uuid, uuid, uuid, text, text)
to service_role;
revoke all on function public.consume_account_reauth_grant_internal(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.consume_account_reauth_grant_internal(uuid, uuid, text, text, text)
to service_role;

-- The unprotected guest and the protected destination are proved by separate
-- verified Auth sessions at the Edge boundary before this function is called.
create or replace function public.begin_account_transfer_internal(
  p_source_user_id uuid,
  p_source_session_id uuid,
  p_destination_user_id uuid,
  p_destination_session_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_account_id uuid;
  v_destination_account_id uuid;
  v_job private.account_transfer_jobs%rowtype;
  v_preview jsonb;
  v_guest_sources integer;
  v_destination_sources integer;
  v_guest_keys integer;
  v_destination_keys integer;
  v_destination_phones integer;
  v_max_sources integer;
  v_max_keys integer;
  v_max_phones integer;
begin
  if p_source_user_id is null or p_destination_user_id is null
    or p_source_user_id = p_destination_user_id
    or p_source_session_id is null or p_destination_session_id is null
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 160 then
    raise exception 'INVALID_TRANSFER_REQUEST';
  end if;
  if not exists (select 1 from auth.users as auth_user
    where auth_user.id = p_source_user_id and coalesce(auth_user.is_anonymous, false)) then
    raise exception 'SOURCE_NOT_GUEST';
  end if;
  if not exists (select 1 from auth.users as auth_user
    where auth_user.id = p_destination_user_id and not coalesce(auth_user.is_anonymous, false)
      and exists (select 1 from auth.identities as identity where identity.user_id = auth_user.id)) then
    raise exception 'DESTINATION_NOT_PROTECTED';
  end if;
  if not exists (select 1 from auth.sessions as auth_session
    where auth_session.id = p_source_session_id and auth_session.user_id = p_source_user_id)
    or not exists (select 1 from auth.sessions as auth_session
    where auth_session.id = p_destination_session_id and auth_session.user_id = p_destination_user_id) then
    raise exception 'INVALID_SESSION';
  end if;

  perform public.assert_account_session_active_internal(p_source_user_id, p_source_session_id);
  perform public.assert_account_session_active_internal(p_destination_user_id, p_destination_session_id);

  v_source_account_id := private.ensure_personal_account(p_source_user_id);
  v_destination_account_id := private.ensure_personal_account(p_destination_user_id);
  if v_source_account_id = v_destination_account_id then raise exception 'SAME_ACCOUNT'; end if;

  select pg_catalog.count(*) into v_guest_sources from public.sources
  where user_id = p_source_user_id and revoked_at is null;
  select pg_catalog.count(*) into v_destination_sources from public.sources
  where user_id = p_destination_user_id and revoked_at is null;
  select pg_catalog.count(*) into v_guest_keys from public.api_keys
  where user_id = p_source_user_id and is_active and revoked_at is null
    and (expires_at is null or expires_at > pg_catalog.now());
  select pg_catalog.count(*) into v_destination_keys from public.api_keys
  where user_id = p_destination_user_id and is_active and revoked_at is null
    and (expires_at is null or expires_at > pg_catalog.now());
  select pg_catalog.count(*) into v_destination_phones
  from private.account_installation_subscriptions
  where account_id = v_destination_account_id and revoked_at is null and delivery_enabled;
  v_max_sources := private.effective_limit(p_destination_user_id, 'max_api_keys');
  v_max_keys := private.effective_limit(p_destination_user_id, 'max_access_keys');
  v_max_phones := private.effective_limit(p_destination_user_id, 'max_push_devices');

  v_preview := pg_catalog.jsonb_build_object(
    'sources', (select pg_catalog.count(*) from public.sources where user_id = p_source_user_id),
    'activeKeys', (select pg_catalog.count(*) from public.api_keys where user_id = p_source_user_id and is_active and revoked_at is null),
    'notifications', (select pg_catalog.count(*) from public.notifications where user_id = p_source_user_id and expires_at > pg_catalog.now()),
    'attachments', (select pg_catalog.count(*) from public.notifications where user_id = p_source_user_id and attachment_path is not null),
    'destinationKeepsPreferences', exists (select 1 from public.app_options where user_id = p_destination_user_id),
    'destinationSources', v_destination_sources,
    'destinationActiveKeys', v_destination_keys,
    'destinationPhones', v_destination_phones,
    'maxSources', v_max_sources,
    'maxActiveKeys', v_max_keys,
    'maxPhones', v_max_phones,
    'sourceLimitConflict', v_destination_sources + v_guest_sources > v_max_sources,
    'keyLimitConflict', v_destination_keys + v_guest_keys > v_max_keys,
    'phoneLimitConflict', v_destination_phones + 1 > v_max_phones
  );

  insert into private.account_transfer_jobs (
    source_account_id, destination_account_id, source_user_id,
    destination_user_id, source_session_id, destination_session_id,
    challenge_hash, idempotency_key, status, preview, expires_at
  ) values (
    v_source_account_id, v_destination_account_id, p_source_user_id,
    p_destination_user_id, p_source_session_id, p_destination_session_id,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_idempotency_key, 'UTF8'), 'sha256'), 'hex'),
    p_idempotency_key, 'previewed', v_preview, pg_catalog.now() + interval '15 minutes'
  )
  on conflict (idempotency_key) do update set updated_at = pg_catalog.now()
  returning * into v_job;
  if v_job.source_user_id <> p_source_user_id
    or v_job.destination_user_id <> p_destination_user_id then
    raise exception 'TRANSFER_IDEMPOTENCY_CONFLICT';
  end if;
  return pg_catalog.jsonb_build_object(
    'transferId', v_job.id, 'status', v_job.status,
    'expiresAt', v_job.expires_at, 'preview', v_job.preview
  );
end;
$$;

create or replace function public.get_account_transfer_internal(
  p_transfer_id uuid,
  p_source_user_id uuid,
  p_destination_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_job private.account_transfer_jobs%rowtype;
begin
  select job.* into v_job from private.account_transfer_jobs as job
  where job.id = p_transfer_id
    and job.source_user_id = p_source_user_id
    and job.destination_user_id = p_destination_user_id;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  return pg_catalog.jsonb_build_object(
    'transferId', v_job.id, 'status', v_job.status,
    'expiresAt', v_job.expires_at, 'preview', v_job.preview
  );
end;
$$;

create or replace function public.commit_account_transfer_internal(
  p_transfer_id uuid,
  p_source_user_id uuid,
  p_destination_user_id uuid,
  p_source_installation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_job private.account_transfer_jobs%rowtype;
begin
  select job.* into v_job from private.account_transfer_jobs as job
  where job.id = p_transfer_id
    and job.source_user_id = p_source_user_id
    and job.destination_user_id = p_destination_user_id
  for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_job.status = 'completed' then
    return pg_catalog.jsonb_build_object('transferId', v_job.id, 'status', 'completed');
  end if;
  if v_job.status <> 'previewed' or v_job.expires_at <= pg_catalog.now() then
    raise exception 'TRANSFER_NOT_READY';
  end if;

  perform public.assert_account_session_active_internal(p_source_user_id, v_job.source_session_id);
  perform public.assert_account_session_active_internal(p_destination_user_id, v_job.destination_session_id);
  if (
    (select pg_catalog.count(*) from public.sources where user_id in (p_source_user_id, p_destination_user_id) and revoked_at is null)
      > private.effective_limit(p_destination_user_id, 'max_api_keys')
    or (select pg_catalog.count(*) from public.api_keys where user_id in (p_source_user_id, p_destination_user_id)
      and is_active and revoked_at is null and (expires_at is null or expires_at > pg_catalog.now()))
      > private.effective_limit(p_destination_user_id, 'max_access_keys')
    or (select pg_catalog.count(*) from private.account_installation_subscriptions
      where account_id = v_job.destination_account_id and revoked_at is null and delivery_enabled)
      + 1 > private.effective_limit(p_destination_user_id, 'max_push_devices')
  ) then raise exception 'TRANSFER_LIMIT_CONFLICT'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:account:' || least(v_job.source_account_id, v_job.destination_account_id)::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:account:' || greatest(v_job.source_account_id, v_job.destination_account_id)::text, 0));
  if not exists (select 1 from private.accounts where id = v_job.source_account_id and status = 'active')
    or not exists (select 1 from private.accounts where id = v_job.destination_account_id and status = 'active') then
    raise exception 'ACCOUNT_INACTIVE';
  end if;

  update private.account_transfer_jobs set status = 'committing', updated_at = pg_catalog.now()
  where id = v_job.id;
  update private.accounts set status = 'transfer_locked', updated_at = pg_catalog.now()
  where id = v_job.source_account_id;
  set constraints notifications_source_owner_fkey,
    ingest_requests_source_owner_fkey, api_keys_source_owner_fkey deferred;

  insert into public.app_options (
    user_id, account_id, push_enabled, play_sound, show_preview,
    created_at, updated_at, live_activity_enabled
  ) select
    p_destination_user_id, v_job.destination_account_id,
    source_options.push_enabled, source_options.play_sound, source_options.show_preview,
    source_options.created_at, pg_catalog.now(), source_options.live_activity_enabled
  from public.app_options as source_options
  where source_options.user_id = p_source_user_id
  on conflict (user_id) do nothing;
  delete from public.app_options where user_id = p_source_user_id;

  update public.notifications set
    user_id = p_destination_user_id,
    account_id = v_job.destination_account_id,
    attachment_path = case when attachment_path is null then null
      else p_destination_user_id::text || '/' || id::text end
  where user_id = p_source_user_id;
  update private.ingest_requests set
    user_id = p_destination_user_id, account_id = v_job.destination_account_id
  where user_id = p_source_user_id;
  update public.api_keys set
    user_id = p_destination_user_id, account_id = v_job.destination_account_id,
    updated_at = pg_catalog.now()
  where user_id = p_source_user_id;
  update public.sources set
    user_id = p_destination_user_id, account_id = v_job.destination_account_id
  where user_id = p_source_user_id;

  delete from public.push_devices as destination_device
  using public.push_devices as source_device
  where source_device.user_id = p_source_user_id
    and source_device.device_id = p_source_installation_id::text
    and destination_device.user_id = p_destination_user_id
    and (destination_device.device_id = source_device.device_id
      or destination_device.expo_push_token = source_device.expo_push_token);
  update public.push_devices set
    user_id = p_destination_user_id, account_id = v_job.destination_account_id,
    updated_at = pg_catalog.now(), disabled_at = null
  where user_id = p_source_user_id and device_id = p_source_installation_id::text;
  delete from public.push_devices
  where user_id = p_source_user_id;

  delete from private.account_installation_subscriptions
  where account_id = v_job.destination_account_id
    and installation_id = p_source_installation_id;
  update private.account_installation_subscriptions set
    account_id = v_job.destination_account_id, user_id = p_destination_user_id,
    delivery_enabled = true, revoked_at = null, updated_at = pg_catalog.now()
  where account_id = v_job.source_account_id
    and installation_id = p_source_installation_id;
  delete from private.account_installation_subscriptions
  where account_id = v_job.source_account_id;

  delete from private.installation_sessions
  where session_id = v_job.destination_session_id;
  update private.installation_sessions set
    session_id = v_job.destination_session_id,
    user_id = p_destination_user_id,
    account_id = v_job.destination_account_id,
    status = 'active', revoked_at = null, last_seen_at = pg_catalog.now()
  where session_id = v_job.source_session_id
    and installation_id = p_source_installation_id;
  delete from private.installation_sessions
  where user_id = p_source_user_id;

  insert into private.account_entitlements (
    user_id, plan_code, status, store, product_id, customer_id,
    starts_at, expires_at, created_at, updated_at
  ) select
    p_destination_user_id, entitlement.plan_code, entitlement.status,
    entitlement.store, entitlement.product_id, entitlement.customer_id,
    entitlement.starts_at, entitlement.expires_at, entitlement.created_at, pg_catalog.now()
  from private.account_entitlements as entitlement
  where entitlement.user_id = p_source_user_id
  on conflict (user_id) do nothing;
  delete from private.account_entitlements where user_id = p_source_user_id;

  insert into public.user_profiles (
    user_id, display_name, locale, timezone, created_at, updated_at
  ) select
    p_destination_user_id, profile.display_name, profile.locale, profile.timezone,
    profile.created_at, pg_catalog.now()
  from public.user_profiles as profile where profile.user_id = p_source_user_id
  on conflict (user_id) do update set
    display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
    locale = coalesce(public.user_profiles.locale, excluded.locale),
    timezone = coalesce(public.user_profiles.timezone, excluded.timezone),
    updated_at = pg_catalog.now();
  delete from public.user_profiles where user_id = p_source_user_id;
  delete from private.account_rate_events where user_id = p_source_user_id;
  delete from private.client_event_logs where user_id = p_source_user_id;
  update private.server_event_logs set user_id = p_destination_user_id
  where user_id = p_source_user_id;
  delete from private.daily_usage_stats where user_id = p_source_user_id;

  update private.account_memberships set status = 'removed', updated_at = pg_catalog.now()
  where account_id = v_job.source_account_id and user_id = p_source_user_id;
  update private.accounts set
    status = 'transferred', transferred_to_account_id = v_job.destination_account_id,
    updated_at = pg_catalog.now()
  where id = v_job.source_account_id;
  update private.account_transfer_jobs set
    status = 'completed', completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = v_job.id;

  perform private.record_account_event(v_job.destination_account_id,
    p_destination_user_id, p_source_installation_id,
    'transfer.complete', 'success',
    pg_catalog.jsonb_build_object('sourceAccountId', v_job.source_account_id));
  return pg_catalog.jsonb_build_object(
    'transferId', v_job.id, 'status', 'completed',
    'accountId', v_job.destination_account_id
  );
end;
$$;

create or replace function public.cancel_account_transfer_internal(
  p_transfer_id uuid,
  p_source_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.account_transfer_jobs set
    status = 'cancelled', updated_at = pg_catalog.now()
  where id = p_transfer_id and source_user_id = p_source_user_id
    and status in ('proof_pending', 'proof_complete', 'previewed');
  return found;
end;
$$;

create or replace function public.list_transfer_auth_cleanup_internal(p_limit integer default 25)
returns table (transfer_id uuid, source_user_id uuid)
language sql
security definer
set search_path = ''
as $$
  select job.id, job.source_user_id
  from private.account_transfer_jobs as job
  where job.status = 'completed'
    and exists (select 1 from auth.users as auth_user where auth_user.id = job.source_user_id)
  order by job.completed_at
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.begin_account_transfer_internal(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.get_account_transfer_internal(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.commit_account_transfer_internal(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.cancel_account_transfer_internal(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.list_transfer_auth_cleanup_internal(integer)
from public, anon, authenticated;
grant execute on function public.begin_account_transfer_internal(uuid, uuid, uuid, uuid, text),
  public.get_account_transfer_internal(uuid, uuid, uuid),
  public.commit_account_transfer_internal(uuid, uuid, uuid, uuid),
  public.cancel_account_transfer_internal(uuid, uuid),
  public.list_transfer_auth_cleanup_internal(integer)
to service_role;

-- v0.0.8 has not shipped, so its direct device-revocation wrapper can be
-- closed. The service-role internal function remains the only supported path.
revoke execute on function public.revoke_account_installation(uuid) from authenticated;

create or replace function public.revoke_account_sessions_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_scope text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_actor_installation_id uuid;
  v_revoked integer;
begin
  if p_user_id is null or p_actor_session_id is null
    or p_scope not in ('others', 'all') then raise exception 'INVALID_SCOPE'; end if;
  select owner.account_id into strict v_account_id
  from private.personal_account_owners as owner where owner.user_id = p_user_id;
  select binding.installation_id into v_actor_installation_id
  from private.installation_sessions as binding
  where binding.user_id = p_user_id and binding.session_id = p_actor_session_id
    and binding.status = 'active' and binding.revoked_at is null;

  update private.installation_sessions set
    status = 'revoked', revoked_at = coalesce(revoked_at, pg_catalog.now()),
    last_seen_at = pg_catalog.now()
  where user_id = p_user_id
    and (p_scope = 'all' or session_id <> p_actor_session_id);
  get diagnostics v_revoked = row_count;
  update private.account_installation_subscriptions set
    delivery_enabled = false,
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  where account_id = v_account_id and user_id = p_user_id
    and (p_scope = 'all' or installation_id is distinct from v_actor_installation_id);
  update public.push_devices set
    disabled_at = coalesce(disabled_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where user_id = p_user_id
    and (p_scope = 'all' or device_id <> coalesce(v_actor_installation_id::text, ''));
  perform private.record_account_event(v_account_id, p_user_id, v_actor_installation_id,
    'sessions.revoke.' || p_scope, 'success',
    pg_catalog.jsonb_build_object('revokedBindings', v_revoked));
  return pg_catalog.jsonb_build_object('scope', p_scope, 'revokedBindings', v_revoked);
end;
$$;

revoke all on function public.revoke_account_sessions_internal(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.revoke_account_sessions_internal(uuid, uuid, text)
to service_role;

create or replace function public.cleanup_account_security_internal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_grants integer;
declare v_transfers integer;
begin
  delete from private.account_reauth_grants
  where expires_at <= pg_catalog.now() or used_at < pg_catalog.now() - interval '1 day';
  get diagnostics v_grants = row_count;
  delete from private.auth_transactions
  where expires_at <= pg_catalog.now()
    or used_at < pg_catalog.now() - interval '1 day'
    or cancelled_at < pg_catalog.now() - interval '1 day';
  update private.account_transfer_jobs set status = 'expired', updated_at = pg_catalog.now()
  where status in ('proof_pending', 'proof_complete', 'previewed')
    and expires_at <= pg_catalog.now();
  get diagnostics v_transfers = row_count;
  return pg_catalog.jsonb_build_object('reauthGrants', v_grants, 'expiredTransfers', v_transfers);
end;
$$;

revoke all on function public.cleanup_account_security_internal()
from public, anon, authenticated;
grant execute on function public.cleanup_account_security_internal() to service_role;

-- Existing write paths do not know account_id yet. These narrow triggers fill
-- it from the unchanged user_id owner contract for old app/API versions.
create or replace function private.fill_resource_account_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select owner.account_id into new.account_id
  from private.personal_account_owners as owner where owner.user_id = new.user_id;
  if new.account_id is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  return new;
end;
$$;

create trigger sources_fill_account_id before insert or update of user_id, account_id on public.sources
for each row execute function private.fill_resource_account_id();
create trigger notifications_fill_account_id before insert or update of user_id, account_id on public.notifications
for each row execute function private.fill_resource_account_id();
create trigger api_keys_fill_account_id before insert or update of user_id, account_id on public.api_keys
for each row execute function private.fill_resource_account_id();
create trigger push_devices_fill_account_id before insert or update of user_id, account_id on public.push_devices
for each row execute function private.fill_resource_account_id();
create trigger app_options_fill_account_id before insert or update of user_id, account_id on public.app_options
for each row execute function private.fill_resource_account_id();
create trigger ingest_requests_fill_account_id before insert or update of user_id, account_id on private.ingest_requests
for each row execute function private.fill_resource_account_id();

revoke all on function private.fill_resource_account_id() from public, anon, authenticated;

delete from private.account_reauth_grants where expires_at <= pg_catalog.now() or used_at is not null;
