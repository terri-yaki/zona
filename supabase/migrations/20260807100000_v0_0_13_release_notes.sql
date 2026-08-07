-- Draft customer-facing v0.0.13 release notes covering iPad support, the
-- Marshmallow theme, per-theme contrast fixes, and the first-launch Settings
-- toggles fix. They stay unpublished until physical-device release checks
-- (including the iPad rows in docs/TEST_PLAN.md) and store submission are
-- complete.

insert into public.app_release_notes (
  version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant,
  legacy_items, is_active
) values (
  '0.0.13',
  '2026-08-07T10:00:00+00:00',
  'Zona, now on iPad',
  'Zona現已登陸iPad',
  'Your alerts and sources feel at home on the bigger screen, with a softer new theme and clearer text in every look.',
  '通知和來源在大螢幕上同樣自在，還有柔和的新主題，以及每個主題下更清晰的文字。',
  '[
    {"key":"zona-on-ipad","icon":"ipad","is_active":true,"title_en":"Zona on iPad","title_zh_hant":"iPad上的Zona","body_en":"Zona now runs on iPad too—your inbox, sources, and settings fill the big screen in portrait, full screen by design.","body_zh_hant":"Zona現在也支援iPad，收件匣、來源和設定以直向全螢幕顯示，充滿整個大螢幕。"},
    {"key":"meet-marshmallow","icon":"paintpalette.fill","is_active":true,"title_en":"Meet Marshmallow","title_zh_hant":"全新Marshmallow主題","body_en":"A soft pink-lavender theme joins the lineup. Pick it in Settings to give your inbox a gentler look.","body_zh_hant":"柔和的粉紫配色加入主題陣容，在設定中選用，讓收件匣煥然一新。"},
    {"key":"clearer-every-theme","icon":"eye.fill","is_active":true,"title_en":"Clearer in every theme","title_zh_hant":"每個主題都更清晰","body_en":"Text, badges, and cards keep their contrast in every preset, so words stay readable on whichever background you choose.","body_zh_hant":"文字、徽章和卡片在所有主題下都保持清晰對比，無論選擇哪種背景，內容都容易閱讀。"},
    {"key":"settings-work-right-away","icon":"switch.2","is_active":true,"title_en":"Settings that work right away","title_zh_hant":"設定開關即開即用","body_en":"New accounts land on switches that respond from the first launch, even when the connection is slow or drops.","body_zh_hant":"新帳戶第一次啟動時，所有設定開關都能立即使用，即使連線緩慢或中斷也不受影響。"}
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

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('zona-on-ipad', 'ipad', 'Zona on iPad', 'iPad上的Zona', 'Zona now runs on iPad too—your inbox, sources, and settings fill the big screen in portrait, full screen by design.', 'Zona現在也支援iPad，收件匣、來源和設定以直向全螢幕顯示，充滿整個大螢幕。', 0),
    ('meet-marshmallow', 'paintpalette.fill', 'Meet Marshmallow', '全新Marshmallow主題', 'A soft pink-lavender theme joins the lineup. Pick it in Settings to give your inbox a gentler look.', '柔和的粉紫配色加入主題陣容，在設定中選用，讓收件匣煥然一新。', 1),
    ('clearer-every-theme', 'eye.fill', 'Clearer in every theme', '每個主題都更清晰', 'Text, badges, and cards keep their contrast in every preset, so words stay readable on whichever background you choose.', '文字、徽章和卡片在所有主題下都保持清晰對比，無論選擇哪種背景，內容都容易閱讀。', 2),
    ('settings-work-right-away', 'switch.2', 'Settings that work right away', '設定開關即開即用', 'New accounts land on switches that respond from the first launch, even when the connection is slow or drops.', '新帳戶第一次啟動時，所有設定開關都能立即使用，即使連線緩慢或中斷也不受影響。', 3)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.13'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = now();
