-- v0.0.12 re-release notes: add the "steadier everyday experience" card that
-- covers the inbox skeleton loading rows, silent Zona Relay reconnects, and
-- the more accurate delivery card. The release stays unpublished
-- (is_active = false) until physical-device release checks and store
-- submission are complete.

update public.app_release_notes
set legacy_items = '[
    {"key":"email-password-sign-in","icon":"lock.fill","is_active":true,"title_en":"Sign in with email and password","title_zh_hant":"使用電郵和密碼登入","body_en":"Save your Zona with an email address and password, then sign back in on another phone.","body_zh_hant":"使用電郵地址和密碼保存你的 Zona，然後在另一部手機重新登入。"},
    {"key":"protect-guest","icon":"shield.fill","is_active":true,"title_en":"Protect a guest account","title_zh_hant":"保護訪客帳戶","body_en":"If you started privately, you can now add an email and password without losing your sources or history.","body_zh_hant":"如果你以私人訪客身份開始，現在可以新增電郵和密碼，而不會遺失來源或紀錄。"},
    {"key":"confirm-with-code","icon":"envelope.fill","is_active":true,"title_en":"Confirm by email code","title_zh_hant":"以電郵驗證碼確認","body_en":"New email addresses are verified with a short code before they can protect your account.","body_zh_hant":"新電郵地址需先以短碼驗證，然後才能保護你的帳戶。"},
    {"key":"steadier-everyday","icon":"sparkles","is_active":true,"title_en":"A steadier everyday experience","title_zh_hant":"更穩定的日常體驗","body_en":"Your inbox loads with a calm preview, the connection quietly recovers on its own, and delivery status only speaks up when there is real news.","body_zh_hant":"收件匣載入時會顯示平和的預覽畫面，連線中斷時會靜靜自動恢復，送達狀態只會在有真正消息時才更新。"}
  ]'::jsonb,
    is_active = false,
    updated_at = now()
where version = '0.0.12';

insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, 'steadier-everyday', 'sparkles',
  'A steadier everyday experience', '更穩定的日常體驗',
  'Your inbox loads with a calm preview, the connection quietly recovers on its own, and delivery status only speaks up when there is real news.',
  '收件匣載入時會顯示平和的預覽畫面，連線中斷時會靜靜自動恢復，送達狀態只會在有真正消息時才更新。',
  3, true
from public.app_release_notes as release
where release.version = '0.0.12'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = now();
