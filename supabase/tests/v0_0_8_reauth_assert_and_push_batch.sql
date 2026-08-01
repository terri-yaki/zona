-- Run with `supabase test db` after applying local migrations.
begin;

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

  -- notifications broadcast trigger must be statement-level (bulk updates emit one
  -- realtime.send per statement, not per row)
  if not exists (
    select 1 from information_schema.triggers
    where trigger_name = 'notifications_broadcast_user_change'
      and event_object_table = 'notifications'
      and action_orientation = 'STATEMENT'
  ) then
    raise exception 'notifications_broadcast_user_change is not STATEMENT oriented';
  end if;
end $$;

rollback;
