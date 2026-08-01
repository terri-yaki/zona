-- Draft customer-facing v0.0.10 release notes. They stay unpublished until
-- physical-device release checks and store submission are complete.

insert into public.app_release_notes (
  version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant,
  legacy_items, is_active
) values (
  '0.0.10',
  '2026-08-01T16:00:00+00:00',
  'Zona, ready when your day changes',
  '一天有變，Zona 隨時候命',
  'Find the right sender faster, take an alert with you, and see at a glance that Zona is ready.',
  '更快找到所需來源、隨手帶走通知內容，還可一眼確認 Zona 是否準備就緒。',
  '[
    {"key":"find-a-source","icon":"magnifyingglass","is_active":true,"title_en":"Find a source faster","title_zh_hant":"更快找到來源","body_en":"Search by source, computer, or key name and jump straight to the sender you need.","body_zh_hant":"按來源、電腦或金鑰名稱搜尋，立即找到你需要的傳送端。"},
    {"key":"take-an-alert","icon":"square.and.arrow.up","is_active":true,"title_en":"Take an alert with you","title_zh_hant":"隨手帶走通知","body_en":"Copy or share the useful parts of an alert without exposing its private technical details.","body_zh_hant":"複製或分享通知中有用的內容，同時不會帶出私人技術資料。"},
    {"key":"know-zona-is-ready","icon":"checkmark.circle.fill","is_active":true,"title_en":"Know Zona is ready","title_zh_hant":"一眼確認 Zona 就緒","body_en":"App Status shows whether your features, account capacity, and latest settings are ready.","body_zh_hant":"「應用程式狀態」會顯示功能、帳戶容量及最新設定是否準備好。"}
  ]'::jsonb,
  false
)
on conflict (version) do update set
  released_at = excluded.released_at,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  summary_en = excluded.summary_en,
  summary_zh_hant = excluded.summary_zh_hant,
  legacy_items = excluded.legacy_items,
  is_active = false,
  updated_at = now();

update public.app_release_note_items
set is_active = false,
    updated_at = now()
where release_id = (
  select id from public.app_release_notes where version = '0.0.10'
);

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('find-a-source', 'magnifyingglass', 'Find a source faster', '更快找到來源', 'Search by source, computer, or key name and jump straight to the sender you need.', '按來源、電腦或金鑰名稱搜尋，立即找到你需要的傳送端。', 0),
    ('take-an-alert', 'square.and.arrow.up', 'Take an alert with you', '隨手帶走通知', 'Copy or share the useful parts of an alert without exposing its private technical details.', '複製或分享通知中有用的內容，同時不會帶出私人技術資料。', 1),
    ('know-zona-is-ready', 'checkmark.circle.fill', 'Know Zona is ready', '一眼確認 Zona 就緒', 'App Status shows whether your features, account capacity, and latest settings are ready.', '「應用程式狀態」會顯示功能、帳戶容量及最新設定是否準備好。', 2)
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
  updated_at = now();
