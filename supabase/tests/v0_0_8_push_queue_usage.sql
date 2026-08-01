-- Run with `supabase test db` after applying local migrations.
begin;

do $$
begin
  if to_regclass('private.push_delivery_jobs') is null
    or to_regclass('private.account_usage_counters') is null
    or to_regclass('private.account_usage_daily') is null
    or to_regclass('private.revoked_auth_sessions') is null then
    raise exception 'v0.0.8 delivery/account security tables are incomplete';
  end if;

  if to_regprocedure('public.claim_push_delivery_jobs_internal(uuid,integer)') is null
    or to_regprocedure('public.accept_push_delivery_ticket_internal(uuid,uuid,text,integer)') is null
    or to_regprocedure('public.fail_push_delivery_job_internal(uuid,uuid,text,boolean,integer)') is null
    or to_regprocedure('public.claim_push_receipt_jobs_internal(uuid,integer)') is null
    or to_regprocedure('public.complete_push_delivery_job_internal(uuid,uuid,text,text,integer)') is null
    or to_regprocedure('public.defer_push_receipt_internal(uuid,uuid,text,integer)') is null
    or to_regprocedure('public.retry_push_delivery_from_receipt_internal(uuid,uuid,text,integer)') is null
    or to_regprocedure('public.get_account_usage()') is null then
    raise exception 'v0.0.8 delivery/account usage RPCs are incomplete';
  end if;

  if has_table_privilege('authenticated', 'private.push_delivery_jobs', 'SELECT')
    or has_table_privilege('authenticated', 'private.account_usage_daily', 'SELECT')
    or has_function_privilege('authenticated', 'public.claim_push_delivery_jobs_internal(uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_account_usage()', 'EXECUTE') then
    raise exception 'delivery or usage privilege is too broad';
  end if;

  if not has_function_privilege('service_role', 'public.claim_push_delivery_jobs_internal(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.complete_push_delivery_job_internal(uuid,uuid,text,text,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_account_usage()', 'EXECUTE') then
    raise exception 'required delivery or usage privilege is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.notifications'::regclass
      and tgname = 'notifications_enqueue_push_jobs'
      and not tgisinternal
  ) then raise exception 'transactional push enqueue trigger is missing'; end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'private.installation_sessions'::regclass
      and tgname = 'installation_sessions_block_denied'
      and not tgisinternal
  ) then raise exception 'durable session denylist trigger is missing'; end if;
end;
$$;

rollback;
