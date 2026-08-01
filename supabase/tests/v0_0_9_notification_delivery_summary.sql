-- Run with `supabase test db` after applying local migrations.
begin;

select plan(26);

select ok(
  to_regprocedure('public.get_notification_delivery_summary(uuid)') is not null,
  'delivery summary RPC exists'
);
select ok(
  not has_function_privilege(
    'anon', 'public.get_notification_delivery_summary(uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute the delivery summary RPC'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.get_notification_delivery_summary(uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute the delivery summary RPC'
);
select ok(
  not has_table_privilege('authenticated', 'private.push_delivery_jobs', 'SELECT'),
  'authenticated callers cannot read private delivery jobs'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.get_notification_delivery_summary(uuid)'::regprocedure
  ) ~ 'perform private\.assert_active_zona_session\(\)',
  'delivery summary explicitly checks the active Zona session'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'delivery-owner@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'delivery-other@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  );

do $$
begin
  perform private.ensure_personal_account('00000000-0000-4000-8000-000000000001');
  perform private.ensure_personal_account('00000000-0000-4000-8000-000000000002');
end;
$$;

insert into public.sources (id, user_id, account_id, display_name, hostname)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Delivery owner source', 'owner-host'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'Other owner source', 'other-host'
  );

insert into public.notifications (
  id, user_id, account_id, source_id, source_name_snapshot,
  title, body, expires_at
) values
  (
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Delivery owner source', 'Zero jobs', 'No phone was targeted',
    pg_catalog.now() + interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Delivery owner source', 'Mixed jobs', 'Mixed outcomes',
    pg_catalog.now() + interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Delivery owner source', 'Retry job', 'Waiting to retry',
    pg_catalog.now() + interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000001004',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Delivery owner source', 'Unknown receipt', 'Receipt could not be confirmed',
    pg_catalog.now() + interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000001005',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Delivery owner source', 'Failed job', 'Message was too large',
    pg_catalog.now() + interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000001006',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000102',
    'Other owner source', 'Other owner', 'Must remain private',
    pg_catalog.now() + interval '1 day'
  );

insert into public.notifications (
  id, user_id, account_id, source_id, source_name_snapshot,
  title, body, created_at, expires_at
) values (
  '00000000-0000-4000-8000-000000001007',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'Delivery owner source', 'Expired', 'No longer in the inbox',
  pg_catalog.now() - interval '1 day', pg_catalog.now() - interval '1 minute'
);

insert into private.push_delivery_jobs (
  notification_id, user_id, push_device_id_snapshot, platform_snapshot,
  show_preview, play_sound, source_sound_snapshot, status,
  last_error_code, completed_at
) values
  (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000002001', 'ios', true, true, 'default',
    'delivered', null, pg_catalog.now()
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000002002', 'ios', true, true, 'default',
    'permanent_failed', 'DEVICE_NOT_REGISTERED', pg_catalog.now()
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000002003', 'ios', true, true, 'default',
    'queued', null, null
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000002004', 'ios', true, true, 'default',
    'retry', 'EXPO_UNAVAILABLE', null
  ),
  (
    '00000000-0000-4000-8000-000000001004',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000002005', 'ios', true, true, 'default',
    'receipt_unknown', 'RECEIPT_UNAVAILABLE', pg_catalog.now()
  ),
  (
    '00000000-0000-4000-8000-000000001005',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000002006', 'ios', true, true, 'default',
    'permanent_failed', 'MESSAGE_TOO_BIG', pg_catalog.now()
  );

-- Isolate aggregate and ownership behavior from Auth's internal session-table
-- shape. The production RPC definition above is separately asserted to call
-- the real active-session guard; this transaction restores it on rollback.
create or replace function public.request_has_active_zona_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
$$;

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000000901"}';
set local role authenticated;

select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001001'
  ) ->> 'state'),
  'not_sent',
  'a notification with zero delivery jobs is not sent'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001001'
  ) ->> 'targetedPhones')::integer,
  0,
  'zero jobs reports zero targeted phones'
);
select ok(
  public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001001'
  ) ->> 'updatedAt' is not null,
  'zero jobs uses the notification creation time as its update time'
);

select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001002'
  ) ->> 'state'),
  'sent',
  'mixed outcomes lead with provider acceptance'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001002'
  ) ->> 'targetedPhones')::integer,
  3,
  'mixed outcomes report all targeted phones'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001002'
  ) ->> 'providerAccepted')::integer,
  1,
  'only a successful provider receipt counts as accepted'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001002'
  ) ->> 'failed')::integer,
  1,
  'mixed outcomes report terminal failures'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001002'
  ) ->> 'pending')::integer,
  1,
  'mixed outcomes report pending work'
);
select is(
  public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001002'
  ) ->> 'reason',
  null,
  'mixed success does not return a misleading failure reason'
);
select is(
  (
    select pg_catalog.array_agg(field.key order by field.key)
    from pg_catalog.jsonb_object_keys(
      public.get_notification_delivery_summary(
        '00000000-0000-4000-8000-000000001002'
      )
    ) as field(key)
  ),
  array[
    'failed', 'pending', 'providerAccepted', 'reason', 'state',
    'targetedPhones', 'updatedAt'
  ]::text[],
  'the projection exposes only presentation-safe fields'
);

select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001003'
  ) ->> 'state'),
  'queued',
  'a retry remains queued'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001003'
  ) ->> 'pending')::integer,
  1,
  'a retry counts as pending'
);

select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001004'
  ) ->> 'state'),
  'needs_attention',
  'an exhausted unknown receipt needs attention'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001004'
  ) ->> 'failed')::integer,
  1,
  'an exhausted unknown receipt is a terminal unsuccessful target'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001004'
  ) ->> 'reason'),
  'unconfirmed',
  'receipt internals are reduced to the safe unconfirmed reason'
);

select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001005'
  ) ->> 'state'),
  'needs_attention',
  'a permanent failure needs attention'
);
select is(
  (public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001005'
  ) ->> 'reason'),
  'message_too_big',
  'raw provider failure is reduced to a safe public reason'
);

select throws_ok(
  $$select public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001006'
  )$$,
  'P0001', 'NOT_FOUND',
  'another owner cannot inspect a notification delivery state'
);
select throws_ok(
  $$select public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001007'
  )$$,
  'P0001', 'NOT_FOUND',
  'an expired notification is indistinguishable from a missing one'
);
select throws_ok(
  $$select public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001099'
  )$$,
  'P0001', 'NOT_FOUND',
  'a missing notification returns the same bounded error'
);

reset role;
set local "request.jwt.claims" = '{}';
set local role authenticated;
select throws_ok(
  $$select public.get_notification_delivery_summary(
    '00000000-0000-4000-8000-000000001001'
  )$$,
  'P0001', 'UNAUTHORIZED',
  'a missing authenticated principal is rejected'
);
reset role;

select * from finish();
rollback;
