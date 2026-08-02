-- Follow-up for features added after the 17:30 migration reached production.
-- This remains additive and idempotent for fresh databases where the catalog
-- rows may already have been created by the earlier migration file.

with feature_data(control_key, category, operator_label, operator_description, sort_order) as (
  values
    ('inbox.search', 'inbox', 'Inbox search', 'Searches the signed-in owner inbox across alert and source fields.', 70),
    ('inbox.saved_filters', 'inbox', 'Saved inbox filters', 'Lets an owner save and reuse bounded inbox filter combinations.', 71),
    ('inbox.pinned_filter', 'inbox', 'Pinned filter', 'Shows the pinned-only inbox filter.', 72),
    ('inbox.severity_filter', 'inbox', 'Severity filter', 'Shows the severity inbox filters.', 73),
    ('inbox.grouping', 'inbox', 'Repeated alert grouping', 'Groups consecutive repeated alerts without deleting individual records.', 74),
    ('notification.pin', 'notification', 'Pin alerts', 'Lets an owner keep selected alerts at the top of the inbox.', 80),
    ('notification.mark_unread', 'notification', 'Mark unread', 'Lets an owner return an alert to the unread state.', 81),
    ('sources.health', 'sources', 'Source health', 'Shows recent alert activity and aggregate delivery health for owned sources.', 90),
    ('sources.schedule', 'sources', 'Source quiet schedules', 'Lets an owner mute pushes from one source on a recurring schedule.', 91),
    ('settings.quiet_hours', 'settings', 'Account quiet hours', 'Lets an owner mute account pushes on a recurring schedule.', 100),
    ('status.copy_diagnostics', 'status', 'Copy diagnostics', 'Copies a redacted diagnostic summary for user support.', 110),
    ('onboarding.first_alert', 'onboarding', 'First alert guide', 'Shows the guided first-alert setup and integration templates.', 120),
    ('ios.widget', 'ios', 'iOS inbox widget', 'Updates the native iOS widget with safe inbox summary fields.', 130),
    ('ios.shortcuts', 'ios', 'iOS Shortcuts', 'Publishes Zona actions to Apple Shortcuts and Siri.', 131)
)
insert into private.app_control_catalog (
  control_key, control_kind, category, operator_label, operator_description,
  value_type, default_value, allowed_values, sort_order
)
select control_key, 'feature', category, operator_label, operator_description,
  'feature_mode', to_jsonb('enabled'::text),
  '["enabled","disabled","hidden","read_only"]'::jsonb, sort_order
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
  updated_at = pg_catalog.now();

insert into private.app_feature_controls (feature_key, mode, priority)
select catalog.control_key, 'enabled', 0
from private.app_control_catalog as catalog
where catalog.control_key = any(array[
    'inbox.search', 'inbox.saved_filters', 'inbox.pinned_filter',
    'inbox.severity_filter', 'inbox.grouping', 'notification.pin',
    'notification.mark_unread', 'sources.health', 'sources.schedule',
    'settings.quiet_hours', 'status.copy_diagnostics',
    'onboarding.first_alert', 'ios.widget', 'ios.shortcuts'
  ]::text[])
  and not exists (
    select 1 from private.app_feature_controls as control
    where control.feature_key = catalog.control_key
      and control.platform is null
      and control.release_channel is null
      and control.locale is null
      and control.account_tier is null
      and control.priority = 0
  );

insert into private.app_feature_controls (feature_key, mode, platform, priority)
select feature_key, 'hidden', 'android', 10
from unnest(array['ios.widget', 'ios.shortcuts']::text[]) as requested(feature_key)
where not exists (
  select 1 from private.app_feature_controls as control
  where control.feature_key = requested.feature_key
    and control.mode = 'hidden'
    and control.platform = 'android'
    and control.priority = 10
    and control.is_active
);

update public.app_release_notes
set title_en = 'Keep the signal, lose the noise',
    title_zh_hant = '保留訊號，減少雜音',
    summary_en = 'Find the alert you need, quiet the hours you protect, and keep important signals close at hand.',
    summary_zh_hant = '找出所需通知、守護安靜時段，並將重要訊號放在最順手的位置。',
    legacy_items = '[
      {"key":"find-any-alert","icon":"magnifyingglass","is_active":true,"title_en":"Find any alert in seconds","title_zh_hant":"數秒內找出通知","body_en":"Search every alert and save the views you return to, whether you follow one source, a severity, or unread work.","body_zh_hant":"搜尋所有通知，並儲存常用畫面，無論你要追蹤特定來源、嚴重程度或未讀工作，都能立即重用。"},
      {"key":"protect-focus","icon":"moon.stars.fill","is_active":true,"title_en":"Protect focus without missing a thing","title_zh_hant":"專心工作，不漏任何通知","body_en":"Set quiet hours for everything or just one noisy source. Every alert still waits safely in your inbox.","body_zh_hant":"為所有通知或單一繁忙來源設定安靜時段，每則通知仍會安全保留在信箱。"},
      {"key":"glance-and-go","icon":"rectangle.3.group.fill","is_active":true,"title_en":"Your signal at a glance","title_zh_hant":"一眼掌握重要訊號","body_en":"Pin important alerts, group repeats, check source health, and see unread work from an iPhone widget.","body_zh_hant":"釘選重要通知、收起重複訊息、查看來源狀態，並透過 iPhone 小工具掌握未讀工作。"}
    ]'::jsonb,
    is_active = false,
    updated_at = pg_catalog.now()
where version = '0.0.10';

update public.app_release_note_items
set is_active = false,
    updated_at = pg_catalog.now()
where release_id = (select id from public.app_release_notes where version = '0.0.10');

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('find-any-alert', 'magnifyingglass', 'Find any alert in seconds', '數秒內找出通知', 'Search every alert and save the views you return to, whether you follow one source, a severity, or unread work.', '搜尋所有通知，並儲存常用畫面，無論你要追蹤特定來源、嚴重程度或未讀工作，都能立即重用。', 0),
    ('protect-focus', 'moon.stars.fill', 'Protect focus without missing a thing', '專心工作，不漏任何通知', 'Set quiet hours for everything or just one noisy source. Every alert still waits safely in your inbox.', '為所有通知或單一繁忙來源設定安靜時段，每則通知仍會安全保留在信箱。', 1),
    ('glance-and-go', 'rectangle.3.group.fill', 'Your signal at a glance', '一眼掌握重要訊號', 'Pin important alerts, group repeats, check source health, and see unread work from an iPhone widget.', '釘選重要通知、收起重複訊息、查看來源狀態，並透過 iPhone 小工具掌握未讀工作。', 2)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.10'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = pg_catalog.now();
