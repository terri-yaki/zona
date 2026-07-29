-- Run with `supabase test db` after applying local migrations.
begin;

do $$
declare
  v_user_id uuid := extensions.gen_random_uuid();
  v_created jsonb;
  v_source_id uuid;
  v_primary_key_id uuid;
  v_second_key_id uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'source-key-test-' || v_user_id::text || '@example.invalid',
    '',
    '{}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  );

  perform private.ensure_personal_account(v_user_id);

  v_created := public.create_source_with_key_internal(
    v_user_id,
    'Compatibility source',
    'test-host',
    pg_catalog.repeat('a', 64),
    'zona_live_12345678'
  );
  v_source_id := (v_created ->> 'sourceId')::uuid;
  v_primary_key_id := (v_created ->> 'accessKeyId')::uuid;

  if not exists (
    select 1
    from public.api_keys as access_key
    join private.source_credentials as credential
      on credential.access_key_id = access_key.id
     and credential.source_id = access_key.source_id
    where access_key.id = v_primary_key_id
      and access_key.source_id = v_source_id
      and access_key.user_id = v_user_id
      and access_key.is_compatibility_primary
      and credential.token_hash = pg_catalog.repeat('a', 64)
  ) then raise exception 'initial compatibility key was not created atomically'; end if;

  v_second_key_id := public.create_source_key_internal(
    v_user_id,
    v_source_id,
    'Replacement key',
    pg_catalog.repeat('b', 64),
    'zona_live_abcdefgh'
  );

  perform public.manage_source_key_internal(v_user_id, v_primary_key_id, 'revoke', null, null);
  if not exists (
    select 1 from public.api_keys
    where id = v_second_key_id and source_id = v_source_id
      and is_active and revoked_at is null
  ) then raise exception 'revoking one key affected its active sibling'; end if;

  if (
    select pg_catalog.count(*)
    from public.notification_source_overview
    where id = v_source_id
  ) <> 1 then raise exception 'legacy overview no longer returns one row per source'; end if;

  if has_function_privilege('authenticated',
      'public.create_source_key_internal(uuid,uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.manage_source_key_internal(uuid,uuid,text,text,boolean)', 'EXECUTE') then
    raise exception 'source-key service function grant is too broad';
  end if;
end;
$$;

rollback;
