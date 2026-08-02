-- Run with `supabase test db` after applying local migrations.
begin;

select plan(22);

select is(
  (select count(*)::integer from private.app_control_catalog),
  88,
  'the operator catalog contains every v0.0.10 feature and setting'
);
select is(
  (select count(*)::integer from private.app_control_catalog where control_kind = 'feature'),
  71,
  'all shipped feature controls are cataloged'
);
select is(
  (select count(*)::integer from private.app_control_catalog where control_kind = 'setting'),
  17,
  'all shipped runtime settings are cataloged'
);
select is(
  (select count(*)::integer from private.app_control_catalog where not is_active),
  1,
  'only the retired foreground OTA watcher is inactive'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.app_control_catalog'::regclass),
  'RLS is enabled as defense in depth on the private catalog'
);
select ok(
  not has_table_privilege('anon', 'private.app_control_catalog', 'SELECT'),
  'anonymous callers cannot read operator controls'
);
select ok(
  not has_table_privilege('authenticated', 'private.app_control_catalog', 'SELECT'),
  'signed-in app users cannot read operator controls directly'
);
select ok(
  has_table_privilege('service_role', 'private.app_control_catalog', 'SELECT'),
  'the server operator role can read the catalog'
);
select ok(
  has_table_privilege('service_role', 'private.app_control_dashboard', 'SELECT'),
  'the server operator role can read the dashboard'
);
select is(
  (select count(distinct feature_key)::integer
   from private.app_feature_controls
   where feature_key in (
     select control_key from private.app_control_catalog where control_kind = 'feature'
   )),
  71,
  'every cataloged feature has a control rule'
);
select is(
  (select count(distinct setting_key)::integer
   from private.app_runtime_settings
   where setting_key in (
     select control_key from private.app_control_catalog where control_kind = 'setting'
   )),
  17,
  'every cataloged setting has a runtime rule'
);
select is(
  (select default_value #>> '{}' from private.app_control_catalog where control_key = 'notification.copy'),
  'enabled',
  'copying notification text is enabled by default'
);
select is(
  (select default_value #>> '{}' from private.app_control_catalog where control_key = 'sources.search_minimum_count'),
  '4',
  'source search has a documented threshold'
);
select is(
  (select minimum_number::integer from private.app_control_catalog where control_key = 'notification.delivery_poll_seconds'),
  5,
  'delivery polling has a safe lower bound'
);
select is(
  (select maximum_number::integer from private.app_control_catalog where control_key = 'notification.attachment_url_ttl_seconds'),
  86400,
  'attachment links have a bounded maximum lifetime'
);
select is(
  (select allowed_values from private.app_control_catalog where control_key = 'ui.density'),
  '["comfortable", "compact"]'::jsonb,
  'interface density accepts only shipped presets'
);
select ok(
  exists (
    select 1 from private.app_feature_controls
    where feature_key = 'settings.app_status' and mode = 'enabled' and is_active
  ),
  'App Status is enabled in the default control snapshot'
);
select ok(
  exists (
    select 1 from private.app_runtime_settings
    where setting_key = 'content.support_url'
      and value_type = 'string'
      and value #>> '{}' ~ '^https://'
      and is_active
  ),
  'the support destination is an HTTPS runtime setting'
);
select is(
  (select is_active from public.app_release_notes where version = '0.0.10'),
  false,
  'v0.0.10 customer notes remain unpublished before release validation'
);
select is(
  (select count(*)::integer
   from public.app_release_note_items as item
   join public.app_release_notes as release on release.id = item.release_id
   where release.version = '0.0.10' and item.is_active),
  3,
  'v0.0.10 has three customer-facing release highlights ready'
);
select is(
  (select count(*)::integer from private.app_control_dashboard),
  88,
  'the operator dashboard covers the whole catalog'
);
select is(
  (select active_rule_count::integer from private.app_control_dashboard where control_key = 'inbox.filters'),
  1,
  'existing baselines are not duplicated by the additive migration'
);

select * from finish();
rollback;
