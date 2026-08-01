-- Fix two transfer limit-check defects:
-- 1) Phone limit: preview flag and commit hard gate added +1 unconditionally,
--    falsely blocking transfers at max_push_devices when no guest installation
--    subscription would actually move (or the moving installation is already
--    live on the destination).
-- 2) Key limit: transfer checks counted only active keys while
--    create_source_key_internal enforces max_access_keys over all non-revoked
--    keys, so a transfer could succeed and immediately violate the canonical
--    quota (or vice versa). Conflict checks now use the canonical non-revoked
--    predicate; preview display counts stay active-only.
-- Re-creates begin/commit_account_transfer_internal from 20260729173751; all
-- other logic unchanged.

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
  v_guest_keys_billable integer;
  v_destination_keys_billable integer;
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
  -- Canonical quota predicate: every non-revoked key occupies a slot, matching
  -- create_source_key_internal's max_access_keys enforcement.
  select pg_catalog.count(*) into v_guest_keys_billable from public.api_keys
  where user_id = p_source_user_id and revoked_at is null;
  select pg_catalog.count(*) into v_destination_keys_billable from public.api_keys
  where user_id = p_destination_user_id and revoked_at is null;
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
    'keyLimitConflict', v_destination_keys_billable + v_guest_keys_billable > v_max_keys,
    -- +1 only when a guest installation subscription could actually move and is
    -- not already live on the destination (the moving installation is chosen at
    -- commit, so this preview is an existence estimate).
    'phoneLimitConflict', v_destination_phones + (
      select case when exists (
        select 1 from private.account_installation_subscriptions s
        where s.account_id = v_source_account_id and s.revoked_at is null and s.delivery_enabled
          and not exists (
            select 1 from private.account_installation_subscriptions d
            where d.account_id = v_destination_account_id and d.installation_id = s.installation_id
              and d.revoked_at is null and d.delivery_enabled)
      ) then 1 else 0 end
    ) > v_max_phones
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
    -- Canonical quota predicate: count every non-revoked key, matching
    -- create_source_key_internal's max_access_keys enforcement.
    or (select pg_catalog.count(*) from public.api_keys where user_id in (p_source_user_id, p_destination_user_id)
      and revoked_at is null)
      > private.effective_limit(p_destination_user_id, 'max_access_keys')
    or (select pg_catalog.count(*) from private.account_installation_subscriptions
      where account_id = v_job.destination_account_id and revoked_at is null and delivery_enabled)
      -- count only the device that will actually move, and only when it is not
      -- already live on the destination (a replace does not grow the count)
      + (select case when exists (
          select 1 from private.account_installation_subscriptions s
          where s.account_id = v_job.source_account_id and s.installation_id = p_source_installation_id
            and s.revoked_at is null and s.delivery_enabled)
          and not exists (
          select 1 from private.account_installation_subscriptions d
          where d.account_id = v_job.destination_account_id and d.installation_id = p_source_installation_id
            and d.revoked_at is null and d.delivery_enabled)
        then 1 else 0 end)
      > private.effective_limit(p_destination_user_id, 'max_push_devices')
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
