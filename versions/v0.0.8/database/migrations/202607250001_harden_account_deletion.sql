-- Make account deletion explicit and auditable before the Auth user is removed.

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
  v_api_keys integer;
  v_credentials integer;
  v_options integer;
  v_rate_events integer;
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:account:' || p_user_id::text, 0)
  );

  select pg_catalog.count(*) into v_api_keys
  from public.api_keys as api_key
  where api_key.user_id = p_user_id;

  select pg_catalog.count(*) into v_credentials
  from private.source_credentials as credential
  join public.sources as source on source.id = credential.source_id
  where source.user_id = p_user_id;

  -- Invalidate every credential before removing its metadata and hash.
  update public.api_keys
  set is_active = false,
      revoked_at = pg_catalog.coalesce(revoked_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  update public.sources
  set revoked_at = pg_catalog.coalesce(revoked_at, pg_catalog.now())
  where user_id = p_user_id;

  delete from public.notifications where user_id = p_user_id;
  get diagnostics v_notifications = row_count;

  delete from public.push_devices where user_id = p_user_id;
  get diagnostics v_devices = row_count;

  delete from public.app_options where user_id = p_user_id;
  get diagnostics v_options = row_count;

  -- API-key metadata, credential hashes, and ingest events cascade from sources.
  delete from public.sources where user_id = p_user_id;
  get diagnostics v_sources = row_count;

  delete from private.account_rate_events where user_id = p_user_id;
  get diagnostics v_rate_events = row_count;

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
