-- v0.0.12 re-release notes: iPad support, Marshmallow theme, contrast fixes,
-- and first-launch Settings toggles. Stays unpublished (is_active = false)
-- until physical-device release checks (including iPad rows in
-- docs/TEST_PLAN.md) and store submission for this re-release are complete.
-- Marketing version remains 0.0.12 (no 0.0.13 app version).

update public.app_release_notes
set released_at = '2026-08-07T10:00:00+00:00',
    title_en = 'Zona, now on iPad',
    title_zh_hant = 'Zona現已登陸iPad',
    summary_en = 'Your alerts and sources feel at home on the bigger screen, with a softer new theme and clearer text in every look.',
    summary_zh_hant = '通知和來源在大螢幕上同樣自在，還有柔和的新主題，以及每個主題下更清晰的文字。',
    legacy_items = '[
    {"key":"zona-on-ipad","icon":"ipad","is_active":true,"title_en":"Zona on iPad","title_zh_hant":"iPad上的Zona","body_en":"Zona now runs on iPad too—your inbox, sources, and settings fill the big screen in portrait, full screen by design.","body_zh_hant":"Zona現在也支援iPad，收件匣、來源和設定以直向全螢幕顯示，充滿整個大螢幕。"},
    {"key":"meet-marshmallow","icon":"paintpalette.fill","is_active":true,"title_en":"Meet Marshmallow","title_zh_hant":"全新Marshmallow主題","body_en":"A soft pink-lavender theme joins the lineup. Pick it in Settings to give your inbox a gentler look.","body_zh_hant":"柔和的粉紫配色加入主題陣容，在設定中選用，讓收件匣煥然一新。"},
    {"key":"clearer-every-theme","icon":"eye.fill","is_active":true,"title_en":"Clearer in every theme","title_zh_hant":"每個主題都更清晰","body_en":"Text, badges, and cards keep their contrast in every preset, so words stay readable on whichever background you choose.","body_zh_hant":"文字、徽章和卡片在所有主題下都保持清晰對比，無論選擇哪種背景，內容都容易閱讀。"},
    {"key":"settings-work-right-away","icon":"switch.2","is_active":true,"title_en":"Settings that work right away","title_zh_hant":"設定開關即開即用","body_en":"New accounts land on switches that respond from the first launch, even when the connection is slow or drops.","body_zh_hant":"新帳戶第一次啟動時，所有設定開關都能立即使用，即使連線緩慢或中斷也不受影響。"},
    {"key":"email-password-sign-in","icon":"lock.fill","is_active":true,"title_en":"Sign in with email and password","title_zh_hant":"使用電郵和密碼登入","body_en":"Save your Zona with an email address and password, then sign back in on another phone.","body_zh_hant":"使用電郵地址和密碼保存你的 Zona，然後在另一部手機重新登入。"},
    {"key":"protect-guest","icon":"shield.fill","is_active":true,"title_en":"Protect a guest account","title_zh_hant":"保護訪客帳戶","body_en":"If you started privately, you can now add an email and password without losing your sources or history.","body_zh_hant":"如果你以私人訪客身份開始，現在可以新增電郵和密碼，而不會遺失來源或紀錄。"},
    {"key":"confirm-with-code","icon":"envelope.fill","is_active":true,"title_en":"Confirm by email code","title_zh_hant":"以電郵驗證碼確認","body_en":"New email addresses are verified with a short code before they can protect your account.","body_zh_hant":"新電郵地址需先以短碼驗證，然後才能保護你的帳戶。"},
    {"key":"steadier-everyday","icon":"sparkles","is_active":true,"title_en":"A steadier everyday experience","title_zh_hant":"更穩定的日常體驗","body_en":"Your inbox loads with a calm preview, the connection quietly recovers on its own, and delivery status only speaks up when there is real news.","body_zh_hant":"收件匣載入時會顯示平和的預覽畫面，連線中斷時會靜靜自動恢復，送達狀態只會在有真正消息時才更新。"}
  ]'::jsonb,
    is_active = false,
    updated_at = now()
where version = '0.0.12';

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('zona-on-ipad', 'ipad', 'Zona on iPad', 'iPad上的Zona', 'Zona now runs on iPad too—your inbox, sources, and settings fill the big screen in portrait, full screen by design.', 'Zona現在也支援iPad，收件匣、來源和設定以直向全螢幕顯示，充滿整個大螢幕。', 0),
    ('meet-marshmallow', 'paintpalette.fill', 'Meet Marshmallow', '全新Marshmallow主題', 'A soft pink-lavender theme joins the lineup. Pick it in Settings to give your inbox a gentler look.', '柔和的粉紫配色加入主題陣容，在設定中選用，讓收件匣煥然一新。', 1),
    ('clearer-every-theme', 'eye.fill', 'Clearer in every theme', '每個主題都更清晰', 'Text, badges, and cards keep their contrast in every preset, so words stay readable on whichever background you choose.', '文字、徽章和卡片在所有主題下都保持清晰對比，無論選擇哪種背景，內容都容易閱讀。', 2),
    ('settings-work-right-away', 'switch.2', 'Settings that work right away', '設定開關即開即用', 'New accounts land on switches that respond from the first launch, even when the connection is slow or drops.', '新帳戶第一次啟動時，所有設定開關都能立即使用，即使連線緩慢或中斷也不受影響。', 3),
    ('email-password-sign-in', 'lock.fill', 'Sign in with email and password', '使用電郵和密碼登入', 'Save your Zona with an email address and password, then sign back in on another phone.', '使用電郵地址和密碼保存你的 Zona，然後在另一部手機重新登入。', 4),
    ('protect-guest', 'shield.fill', 'Protect a guest account', '保護訪客帳戶', 'If you started privately, you can now add an email and password without losing your sources or history.', '如果你以私人訪客身份開始，現在可以新增電郵和密碼，而不會遺失來源或紀錄。', 5),
    ('confirm-with-code', 'envelope.fill', 'Confirm by email code', '以電郵驗證碼確認', 'New email addresses are verified with a short code before they can protect your account.', '新電郵地址需先以短碼驗證，然後才能保護你的帳戶。', 6),
    ('steadier-everyday', 'sparkles', 'A steadier everyday experience', '更穩定的日常體驗', 'Your inbox loads with a calm preview, the connection quietly recovers on its own, and delivery status only speaks up when there is real news.', '收件匣載入時會顯示平和的預覽畫面，連線中斷時會靜靜自動恢復，送達狀態只會在有真正消息時才更新。', 7)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.12'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = now();
