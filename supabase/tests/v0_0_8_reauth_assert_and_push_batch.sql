-- Run with `supabase test db` after applying local migrations.
begin;

select plan(1);

do $$
begin
  -- assert-only reauth grant check (no used_at write) exists with exact signature
  if to_regprocedure('public.assert_account_reauth_grant_internal(uuid,uuid,text,text,text)') is null then
    raise exception 'assert_account_reauth_grant_internal is missing';
  end if;

  -- batch push outcome RPCs exist with exact signatures
  if to_regprocedure('public.apply_push_send_outcomes_internal(uuid,jsonb)') is null
    or to_regprocedure('public.apply_push_receipt_outcomes_internal(uuid,jsonb)') is null then
    raise exception 'batch push outcome RPCs are incomplete';
  end if;

  -- batch RPCs and the assert RPC are service_role only
  if has_function_privilege('anon', 'public.assert_account_reauth_grant_internal(uuid,uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.assert_account_reauth_grant_internal(uuid,uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.apply_push_send_outcomes_internal(uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.apply_push_send_outcomes_internal(uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.apply_push_receipt_outcomes_internal(uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.apply_push_receipt_outcomes_internal(uuid,jsonb)', 'EXECUTE') then
    raise exception 'assert/batch push RPC grant is too broad';
  end if;

  if not has_function_privilege('service_role', 'public.assert_account_reauth_grant_internal(uuid,uuid,text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.apply_push_send_outcomes_internal(uuid,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.apply_push_receipt_outcomes_internal(uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role grant missing on assert/batch push RPCs';
  end if;

  -- Each operation has its own transition-table trigger. All three must remain
  -- statement-level so bulk changes emit one broadcast per affected user.
  if (
    select pg_catalog.count(*)
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'notifications'
      and trigger_name in (
        'notifications_broadcast_insert',
        'notifications_broadcast_update',
        'notifications_broadcast_delete'
      )
      and action_orientation = 'STATEMENT'
  ) <> 3 then
    raise exception 'notification broadcast triggers are not STATEMENT oriented';
  end if;
end $$;

select pass('v0.0.8 reauth, push batch, and broadcast contract holds');
select * from finish();

rollback;
