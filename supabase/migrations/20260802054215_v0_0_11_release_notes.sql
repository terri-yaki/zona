-- Draft customer-facing v0.0.11 release notes. They stay unpublished until
-- physical-device release checks and store submission are complete.

insert into public.app_release_notes (
  version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant,
  legacy_items, is_active
) values (
  '0.0.11',
  '2026-08-02T05:30:00+00:00',
  'Your look, everywhere',
  '你的風格，處處到位',
  'Two new themes, colors that follow every corner of Zona, and a plainer cache control.',
  '兩款新主題，顏色跟隨 Zona 每個角落，快取控制更直接。',
  '[
    {"key":"new-themes","icon":"paintpalette","is_active":true,"title_en":"Two new themes","title_zh_hant":"兩款新主題","body_en":"Go black and white with Minimalist, or light up the dark with Neon.","body_zh_hant":"「極簡」黑白純粹，「霓虹」照亮黑夜。"},
    {"key":"theme-everywhere","icon":"arrow.triangle.2.circlepath","is_active":true,"title_en":"Colors that keep up","title_zh_hant":"顏色即時跟上","body_en":"Switching themes now changes the header, tab bar, and inbox cards right away.","body_zh_hant":"切換主題後，標題列、分頁列及通知卡片都會即時換色。"},
    {"key":"live-status-theme","icon":"rectangle.3.group.fill","is_active":true,"title_en":"Live Status matches your theme","title_zh_hant":"即時動態配合主題","body_en":"The Lock Screen card now uses the theme color you picked.","body_zh_hant":"鎖定畫面卡片現在使用你選擇的主題顏色。"},
    {"key":"plain-cache-control","icon":"internaldrive","is_active":true,"title_en":"Plainer cache control","title_zh_hant":"快取控制更直接","body_en":"Settings says Clear cache, and the confirmation asks the same way.","body_zh_hant":"設定直接顯示「清除快取」，確認提示也用同一字眼。"}
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
  select id from public.app_release_notes where version = '0.0.11'
);

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('new-themes', 'paintpalette', 'Two new themes', '兩款新主題', 'Go black and white with Minimalist, or light up the dark with Neon.', '「極簡」黑白純粹，「霓虹」照亮黑夜。', 0),
    ('theme-everywhere', 'arrow.triangle.2.circlepath', 'Colors that keep up', '顏色即時跟上', 'Switching themes now changes the header, tab bar, and inbox cards right away.', '切換主題後，標題列、分頁列及通知卡片都會即時換色。', 1),
    ('live-status-theme', 'rectangle.3.group.fill', 'Live Status matches your theme', '即時動態配合主題', 'The Lock Screen card now uses the theme color you picked.', '鎖定畫面卡片現在使用你選擇的主題顏色。', 2),
    ('plain-cache-control', 'internaldrive', 'Plainer cache control', '快取控制更直接', 'Settings says Clear cache, and the confirmation asks the same way.', '設定直接顯示「清除快取」，確認提示也用同一字眼。', 3)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.11'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = now();
