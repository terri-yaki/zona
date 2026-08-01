-- Run with `supabase test db` after applying local migrations.
begin;

select plan(1);

do $$
begin
  if to_regclass('private.accounts') is null
    or to_regclass('private.account_memberships') is null
    or to_regclass('private.app_installations') is null
    or to_regclass('private.installation_sessions') is null
    or to_regclass('private.account_deletion_jobs') is null then
    raise exception 'v0.0.8 account tables are incomplete';
  end if;

  if to_regprocedure('public.get_account_summary()') is null
    or to_regprocedure('public.bind_account_installation(uuid,text,text,integer,text)') is null
    or to_regprocedure('public.prepare_push_token_reassignment_internal(uuid,uuid,uuid,text)') is null
    or to_regprocedure('public.list_account_installations()') is null
    or to_regprocedure('public.revoke_account_installation(uuid)') is null then
    raise exception 'v0.0.8 owner RPCs are incomplete';
  end if;

  if has_function_privilege('anon', 'public.get_account_summary()', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_account_installations()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.prepare_push_token_reassignment_internal(uuid,uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.delete_account_data_internal(uuid)', 'EXECUTE') then
    raise exception 'privileged account RPC grant is too broad';
  end if;

  if not has_function_privilege('authenticated', 'public.get_account_summary()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_account_installations()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.prepare_push_token_reassignment_internal(uuid,uuid,uuid,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.delete_account_data_internal(uuid)', 'EXECUTE') then
    raise exception 'required account RPC grant is missing';
  end if;

  if exists (
    select 1 from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('account_profiles', 'user_profiles')
      and not relation.relrowsecurity
  ) then raise exception 'public account relation is missing RLS'; end if;

  if exists (
    select 1 from private.personal_account_owners
    group by user_id having pg_catalog.count(*) <> 1
  ) or exists (
    select 1 from auth.users as auth_user
    where not exists (
      select 1 from private.personal_account_owners as owner
      where owner.user_id = auth_user.id
    )
  ) then raise exception 'personal-account backfill parity failed'; end if;
end;
$$;

select pass('v0.0.8 account foundation security contract holds');
select * from finish();

rollback;
