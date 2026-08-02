-- Run with `supabase test db` after applying local migrations.
begin;

select plan(24);

select ok(to_regprocedure('public.get_inbox_page_v2(uuid,timestamp with time zone,boolean,boolean,text,text,boolean,timestamp with time zone,uuid,integer)') is not null, 'searchable inbox RPC exists');
select ok(to_regprocedure('public.set_inbox_notification_pin(uuid,boolean)') is not null, 'pin RPC exists');
select ok(to_regprocedure('public.list_saved_inbox_filters()') is not null, 'saved-filter list RPC exists');
select ok(to_regprocedure('public.save_inbox_filter(uuid,text,text,uuid,boolean,boolean,text,integer)') is not null, 'saved-filter write RPC exists');
select ok(to_regprocedure('public.delete_saved_inbox_filter(uuid)') is not null, 'saved-filter delete RPC exists');
select ok(to_regprocedure('public.get_notification_schedule(uuid)') is not null, 'schedule read RPC exists');
select ok(to_regprocedure('public.set_notification_schedule(uuid,boolean,text,smallint[],integer,integer)') is not null, 'schedule write RPC exists');
select ok(to_regprocedure('public.get_source_health()') is not null, 'source health RPC exists');

select ok(has_function_privilege('authenticated', 'public.get_inbox_page_v2(uuid,timestamp with time zone,boolean,boolean,text,text,boolean,timestamp with time zone,uuid,integer)', 'EXECUTE'), 'authenticated users can search their inbox');
select ok(not has_function_privilege('anon', 'public.get_inbox_page_v2(uuid,timestamp with time zone,boolean,boolean,text,text,boolean,timestamp with time zone,uuid,integer)', 'EXECUTE'), 'anonymous users cannot search an inbox');
select ok(has_function_privilege('authenticated', 'public.set_inbox_notification_pin(uuid,boolean)', 'EXECUTE'), 'authenticated users can call owner-checked pinning');
select ok(not has_function_privilege('anon', 'public.set_inbox_notification_pin(uuid,boolean)', 'EXECUTE'), 'anonymous users cannot pin alerts');
select ok(not has_table_privilege('authenticated', 'private.saved_inbox_filters', 'SELECT'), 'saved-filter rows are not directly exposed');
select ok(not has_table_privilege('authenticated', 'private.notification_schedules', 'SELECT'), 'schedule rows are not directly exposed');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'private.saved_inbox_filters'::regclass), 'saved filters have RLS defense in depth');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'private.notification_schedules'::regclass), 'schedules have RLS defense in depth');

select ok(pg_catalog.pg_get_functiondef('public.get_inbox_page_v2(uuid,timestamp with time zone,boolean,boolean,text,text,boolean,timestamp with time zone,uuid,integer)'::regprocedure) ~ 'assert_active_zona_session', 'inbox search checks the active Zona session');
select ok(pg_catalog.pg_get_functiondef('public.set_inbox_notification_pin(uuid,boolean)'::regprocedure) ~ 'assert_active_zona_session', 'pinning checks the active Zona session');
select ok(pg_catalog.pg_get_functiondef('public.save_inbox_filter(uuid,text,text,uuid,boolean,boolean,text,integer)'::regprocedure) ~ 'assert_active_zona_session', 'saved-filter writes check the active Zona session');
select ok(pg_catalog.pg_get_functiondef('public.set_notification_schedule(uuid,boolean,text,smallint[],integer,integer)'::regprocedure) ~ 'assert_active_zona_session', 'schedule writes check the active Zona session');
select ok(pg_catalog.pg_get_functiondef('public.get_source_health()'::regprocedure) ~ 'assert_active_zona_session', 'source health checks the active Zona session');

select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'pinned_at'), 'notifications store pin state');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'push_suppressed_reason'), 'notifications store bounded push-suppression reason');
select ok(pg_catalog.pg_get_functiondef('private.enqueue_notification_push_jobs()'::regprocedure) ~ 'notification_push_is_quiet', 'push enqueue consults quiet schedules after inbox insertion');

select * from finish();
rollback;
