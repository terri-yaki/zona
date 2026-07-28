-- Publish benefit-led v0.0.7 notes and bring v0.0.6 in line with the same
-- non-technical editorial standard.

insert into public.app_release_notes (
  version,
  released_at,
  title_en,
  title_zh_hant,
  summary_en,
  summary_zh_hant,
  legacy_items,
  is_active
) values
(
  '0.0.6',
  '2026-07-28T08:00:00+00:00',
  'Zona fits the way you work',
  'Zona更配合你的使用方式',
  'Helpful notices arrive at the right moment, while the controls you count on stay close at hand.',
  '重要提示在合適時間出現，常用控制則繼續放在順手的位置。',
  '[
    {"key":"clearer-guidance","icon":"info.circle.fill","is_active":true,"title_en":"Clearer guidance when it matters","title_zh_hant":"需要時，指引更清楚","body_en":"Zona can share timely service notices and point you toward an update when one is important.","body_zh_hant":"Zona可在合適時間顯示服務提示，重要更新推出時亦會帶你前往更新。"},
    {"key":"steadier-experience","icon":"shield.lefthalf.filled","is_active":true,"title_en":"A steadier everyday experience","title_zh_hant":"日常使用更穩定","body_en":"Quiet improvements keep your inbox and essential controls feeling dependable.","body_zh_hant":"一系列細緻改進，讓信箱及重要控制更可靠。"}
  ]'::jsonb,
  true
),
(
  '0.0.7',
  '2026-07-28T12:00:00+00:00',
  'Your inbox is ready when you are',
  '信箱準備好，你一打開就能看',
  'Recent alerts, sources, and settings open from your phone first, then quietly catch up.',
  '最近的通知、來源及設定先從手機開啟，然後在背景悄悄追上最新狀態。',
  '[
    {"key":"open-and-go","icon":"bolt.fill","is_active":true,"title_en":"Open Zona and get moving","title_zh_hant":"打開Zona，立即掌握","body_en":"Your recent inbox appears right away, so checking an alert feels effortless.","body_zh_hant":"最近的通知立即出現，查看提醒更輕鬆。"},
    {"key":"between-connections","icon":"tray.full.fill","is_active":true,"title_en":"Useful even between connections","title_zh_hant":"網絡不穩，仍然有用","body_en":"Keep browsing recent alerts while offline, and Zona catches up when you reconnect.","body_zh_hant":"離線時仍可瀏覽最近通知，重新連線後Zona會自動追上進度。"},
    {"key":"account-private","icon":"person.crop.circle.fill","is_active":true,"title_en":"Saved for you, and only you","title_zh_hant":"只為你儲存","body_en":"Each account stays separate, and its saved content leaves the phone when you sign out.","body_zh_hant":"每個帳戶各自分開，登出時其儲存內容亦會離開手機。"},
    {"key":"cache-control","icon":"internaldrive","is_active":true,"title_en":"You stay in control","title_zh_hant":"由你掌控","body_en":"See how much Zona has saved and clear it any time from Settings.","body_zh_hant":"在設定中查看Zona儲存了多少內容，亦可隨時清除。"}
  ]'::jsonb,
  true
)
on conflict (version) do update set
  released_at = excluded.released_at,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  summary_en = excluded.summary_en,
  summary_zh_hant = excluded.summary_zh_hant,
  legacy_items = excluded.legacy_items,
  is_active = excluded.is_active,
  updated_at = pg_catalog.now();

update public.app_release_note_items
set is_active = false,
    updated_at = pg_catalog.now()
where release_id = (
  select id from public.app_release_notes where version = '0.0.6'
);

with item_data(version, item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('0.0.6', 'clearer-guidance', 'info.circle.fill', 'Clearer guidance when it matters', '需要時，指引更清楚', 'Zona can share timely service notices and point you toward an update when one is important.', 'Zona可在合適時間顯示服務提示，重要更新推出時亦會帶你前往更新。', 0),
    ('0.0.6', 'steadier-experience', 'shield.lefthalf.filled', 'A steadier everyday experience', '日常使用更穩定', 'Quiet improvements keep your inbox and essential controls feeling dependable.', '一系列細緻改進，讓信箱及重要控制更可靠。', 1),
    ('0.0.7', 'open-and-go', 'bolt.fill', 'Open Zona and get moving', '打開Zona，立即掌握', 'Your recent inbox appears right away, so checking an alert feels effortless.', '最近的通知立即出現，查看提醒更輕鬆。', 0),
    ('0.0.7', 'between-connections', 'tray.full.fill', 'Useful even between connections', '網絡不穩，仍然有用', 'Keep browsing recent alerts while offline, and Zona catches up when you reconnect.', '離線時仍可瀏覽最近通知，重新連線後Zona會自動追上進度。', 1),
    ('0.0.7', 'account-private', 'person.crop.circle.fill', 'Saved for you, and only you', '只為你儲存', 'Each account stays separate, and its saved content leaves the phone when you sign out.', '每個帳戶各自分開，登出時其儲存內容亦會離開手機。', 2),
    ('0.0.7', 'cache-control', 'internaldrive', 'You stay in control', '由你掌控', 'See how much Zona has saved and clear it any time from Settings.', '在設定中查看Zona儲存了多少內容，亦可隨時清除。', 3)
)
insert into public.app_release_note_items (
  release_id,
  item_key,
  icon_name,
  title_en,
  title_zh_hant,
  body_en,
  body_zh_hant,
  position,
  is_active
)
select
  release.id,
  item.item_key,
  item.icon_name,
  item.title_en,
  item.title_zh_hant,
  item.body_en,
  item.body_zh_hant,
  item.position,
  true
from item_data as item
join public.app_release_notes as release on release.version = item.version
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = excluded.is_active,
  updated_at = pg_catalog.now();
