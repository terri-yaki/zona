-- v0.0.10 Control Room catalog.
-- This catalog is private operator metadata. Shipped clients continue to read
-- only the evaluated snapshot returned by public.get_app_bootstrap().

create table private.app_control_catalog (
  control_key text primary key check (control_key ~ '^[a-z][a-z0-9_.]+$'),
  control_kind text not null check (control_kind in ('feature', 'setting')),
  category text not null check (category ~ '^[a-z][a-z0-9_]+$'),
  operator_label text not null check (char_length(operator_label) between 1 and 100),
  operator_description text not null check (char_length(operator_description) between 1 and 500),
  value_type text not null check (value_type in ('feature_mode', 'boolean', 'number', 'string', 'json')),
  default_value jsonb not null,
  minimum_number numeric,
  maximum_number numeric,
  allowed_values jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_number is null or maximum_number is null or minimum_number <= maximum_number),
  check (allowed_values is null or jsonb_typeof(allowed_values) = 'array'),
  check (
    (value_type = 'feature_mode' and jsonb_typeof(default_value) = 'string')
    or (value_type = 'boolean' and jsonb_typeof(default_value) = 'boolean')
    or (value_type = 'number' and jsonb_typeof(default_value) = 'number')
    or (value_type = 'string' and jsonb_typeof(default_value) = 'string')
    or value_type = 'json'
  ),
  check (
    (control_kind = 'feature' and value_type = 'feature_mode')
    or (control_kind = 'setting' and value_type <> 'feature_mode')
  )
);

alter table private.app_control_catalog enable row level security;

create trigger app_control_catalog_set_updated_at
before update on private.app_control_catalog
for each row execute function private.set_updated_at();

revoke all on private.app_control_catalog from public, anon, authenticated;
grant select, insert, update, delete on private.app_control_catalog to service_role;

with feature_data(control_key, sort_order) as (
  select feature.control_key, (row_number() over ())::integer
  from unnest(array[
    'inbox.summary', 'inbox.filters', 'inbox.source_filter', 'inbox.unread_filter',
    'inbox.time_filter', 'inbox.mark_all_read', 'inbox.show_revoked_filters',
    'inbox.pull_to_refresh', 'inbox.pagination', 'inbox.category_badges',
    'inbox.attachment_badges', 'inbox.relative_time', 'notification.attachments',
    'notification.category', 'notification.metadata', 'notification.severity',
    'notification.delivery_status', 'notification.copy', 'notification.share',
    'notification.absolute_time', 'sources.create', 'sources.search',
    'sources.pull_to_refresh', 'sources.status_badges', 'sources.hostname',
    'sources.last_seen', 'sources.rename', 'sources.pause', 'sources.test',
    'sources.sound', 'source_keys.create', 'source_keys.rename',
    'source_keys.pull_to_refresh', 'settings.account_summary',
    'settings.delivery_status', 'settings.push', 'settings.push_registration',
    'settings.sound', 'settings.preview', 'settings.live_activity',
    'settings.language', 'settings.theme', 'settings.whats_new',
    'settings.manual_update', 'settings.user_guide', 'settings.offline_cache',
    'settings.app_status', 'account.usage', 'status.control_summary',
    'status.plan_limits', 'status.configuration_details', 'status.support_link',
    'onboarding.push', 'background.live_activity', 'background.ota_updates',
    'background.push_registration', 'background.client_telemetry'
  ]::text[]) as feature(control_key)
)
insert into private.app_control_catalog (
  control_key, control_kind, category, operator_label,
  operator_description, value_type, default_value, allowed_values, sort_order
)
select
  control_key,
  'feature',
  split_part(control_key, '.', 1),
  initcap(replace(replace(control_key, '_', ' '), '.', ' · ')),
  'Controls whether the ' || replace(control_key, '_', ' ') || ' interface is available. Authorization and destructive safety actions are never delegated to this control.',
  'feature_mode',
  to_jsonb('enabled'::text),
  '["enabled","disabled","hidden","read_only"]'::jsonb,
  sort_order
from feature_data
on conflict (control_key) do update set
  control_kind = excluded.control_kind,
  category = excluded.category,
  operator_label = excluded.operator_label,
  operator_description = excluded.operator_description,
  value_type = excluded.value_type,
  default_value = excluded.default_value,
  allowed_values = excluded.allowed_values,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with setting_data(
  control_key, category, operator_label, operator_description, value_type,
  default_value, minimum_number, maximum_number, allowed_values, sort_order
) as (
  values
    ('content.user_guide_url', 'content', 'User guide URL', 'HTTPS page opened from the user guide row.', 'string', to_jsonb('https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc'::text), null::numeric, null::numeric, null::jsonb, 1),
    ('content.support_url', 'content', 'Support URL', 'HTTPS page opened from App Status when a user needs help.', 'string', to_jsonb('https://github.com/terri-yaki/zona/issues'::text), null, null, null, 2),
    ('runtime.refresh_seconds', 'runtime', 'Control refresh interval', 'Seconds before a signed-in app checks for a newer control snapshot.', 'number', '300'::jsonb, 60, 3600, null, 10),
    ('inbox.page_size', 'inbox', 'Inbox page size', 'Number of notifications requested in each inbox page.', 'number', '30'::jsonb, 10, 100, null, 20),
    ('inbox.time_filter_hours', 'inbox', 'Recent filter hours', 'Number of hours covered by the quick recent-time filter.', 'number', '24'::jsonb, 1, 168, null, 21),
    ('inbox.card_title_lines', 'inbox', 'Title line limit', 'Maximum lines used by an inbox notification title.', 'number', '1'::jsonb, 1, 3, null, 22),
    ('inbox.card_body_lines', 'inbox', 'Body line limit', 'Maximum preview lines used by an inbox notification body.', 'number', '2'::jsonb, 1, 6, null, 23),
    ('inbox.card_spacing', 'inbox', 'Inbox card spacing', 'Vertical space in points around each inbox card.', 'number', '6'::jsonb, 2, 16, null, 24),
    ('inbox.max_source_filters', 'inbox', 'Source filter limit', 'Maximum number of source chips shown in the inbox filter strip.', 'number', '50'::jsonb, 5, 100, null, 25),
    ('sources.online_window_minutes', 'sources', 'Online activity window', 'Minutes since last activity for a source to appear online.', 'number', '5'::jsonb, 1, 60, null, 30),
    ('sources.search_minimum_count', 'sources', 'Search appearance threshold', 'Number of sources required before the search field appears.', 'number', '4'::jsonb, 0, 100, null, 31),
    ('sources.card_spacing', 'sources', 'Source card spacing', 'Vertical space in points around each source card.', 'number', '6'::jsonb, 2, 16, null, 32),
    ('notification.delivery_poll_seconds', 'notification', 'Delivery refresh interval', 'Seconds between delivery-state checks while notification details are open.', 'number', '15'::jsonb, 5, 300, null, 40),
    ('notification.attachment_url_ttl_seconds', 'notification', 'Attachment link lifetime', 'Seconds an attachment download link remains valid.', 'number', '3600'::jsonb, 60, 86400, null, 41),
    ('status.config_stale_after_seconds', 'status', 'Stale configuration threshold', 'Seconds before App Status asks the user to refresh saved settings.', 'number', '900'::jsonb, 60, 86400, null, 50),
    ('status.show_internal_revision', 'status', 'Show settings revision', 'Shows the internal control revision on App Status for diagnostics.', 'boolean', 'false'::jsonb, null, null, null, 51),
    ('ui.density', 'ui', 'Interface density', 'Chooses the supported spacing preset used by adaptable lists.', 'string', to_jsonb('comfortable'::text), null, null, '["comfortable","compact"]'::jsonb, 60)
)
insert into private.app_control_catalog (
  control_key, control_kind, category, operator_label, operator_description,
  value_type, default_value, minimum_number, maximum_number, allowed_values, sort_order
)
select control_key, 'setting', category, operator_label, operator_description,
  value_type, default_value, minimum_number, maximum_number, allowed_values, sort_order
from setting_data
on conflict (control_key) do update set
  control_kind = excluded.control_kind,
  category = excluded.category,
  operator_label = excluded.operator_label,
  operator_description = excluded.operator_description,
  value_type = excluded.value_type,
  default_value = excluded.default_value,
  minimum_number = excluded.minimum_number,
  maximum_number = excluded.maximum_number,
  allowed_values = excluded.allowed_values,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Add a global enabled baseline only when the operator has not already created
-- one. More-specific or higher-priority rules remain authoritative.
insert into private.app_feature_controls (feature_key, mode, priority)
select catalog.control_key, catalog.default_value #>> '{}', 0
from private.app_control_catalog as catalog
where catalog.control_kind = 'feature'
  and catalog.is_active
  and not exists (
    select 1 from private.app_feature_controls as control
    where control.feature_key = catalog.control_key
      and control.platform is null
      and control.release_channel is null
      and control.locale is null
      and control.account_tier is null
      and control.min_build_number is null
      and control.max_build_number is null
      and control.starts_at is null
      and control.expires_at is null
      and control.priority = 0
  );

insert into private.app_runtime_settings (setting_key, value_type, value, description, priority)
select catalog.control_key, catalog.value_type, catalog.default_value,
  catalog.operator_description, 0
from private.app_control_catalog as catalog
where catalog.control_kind = 'setting'
  and catalog.is_active
  and not exists (
    select 1 from private.app_runtime_settings as setting
    where setting.setting_key = catalog.control_key
      and setting.platform is null
      and setting.release_channel is null
      and setting.locale is null
      and setting.account_tier is null
      and setting.min_build_number is null
      and setting.max_build_number is null
      and setting.starts_at is null
      and setting.expires_at is null
      and setting.priority = 0
  );

create view private.app_control_dashboard
with (security_invoker = true)
as
select
  catalog.control_key,
  catalog.control_kind,
  catalog.category,
  catalog.operator_label,
  catalog.operator_description,
  catalog.value_type,
  catalog.default_value,
  catalog.minimum_number,
  catalog.maximum_number,
  catalog.allowed_values,
  catalog.sort_order,
  catalog.is_active,
  case
    when catalog.control_kind = 'feature' then (
      select count(*) from private.app_feature_controls as control
      where control.feature_key = catalog.control_key and control.is_active
    )
    else (
      select count(*) from private.app_runtime_settings as setting
      where setting.setting_key = catalog.control_key and setting.is_active
    )
  end as active_rule_count,
  case
    when catalog.control_kind = 'feature' then (
      select count(*) from private.app_feature_controls as control
      where control.feature_key = catalog.control_key and control.is_active and control.priority <> 0
    )
    else (
      select count(*) from private.app_runtime_settings as setting
      where setting.setting_key = catalog.control_key and setting.is_active and setting.priority <> 0
    )
  end as active_override_count
from private.app_control_catalog as catalog;

revoke all on private.app_control_dashboard from public, anon, authenticated;
grant select on private.app_control_dashboard to service_role;

comment on table private.app_control_catalog is
  'Private operator catalog for presentation-only app controls supported by shipped clients.';
comment on view private.app_control_dashboard is
  'Private operator inventory with active rule and override counts.';
