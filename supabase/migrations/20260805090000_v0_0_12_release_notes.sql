-- Draft customer-facing v0.0.12 release notes. They stay unpublished until
-- physical-device release checks and store submission are complete.

insert into public.app_release_notes (
  version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant,
  legacy_items, is_active
) values (
  '0.0.12',
  '2026-08-05T09:00:00+00:00',
  'Sign in with email and password',
  '使用電郵和密碼登入',
  'Protect and recover your Zona with an email address and password you choose.',
  '使用你選擇的電郵地址和密碼保護並恢復你的 Zona。',
  '[
    {"key":"email-password-sign-in","icon":"lock.fill","is_active":true,"title_en":"Sign in with email and password","title_zh_hant":"使用電郵和密碼登入","body_en":"Save your Zona with an email address and password, then sign back in on another phone.","body_zh_hant":"使用電郵地址和密碼保存你的 Zona，然後在另一部手機重新登入。"},
    {"key":"protect-guest","icon":"shield.fill","is_active":true,"title_en":"Protect a guest account","title_zh_hant":"保護訪客帳戶","body_en":"If you started privately, you can now add an email and password without losing your sources or history.","body_zh_hant":"如果你以私人訪客身份開始，現在可以新增電郵和密碼，而不會遺失來源或紀錄。"},
    {"key":"confirm-with-code","icon":"envelope.fill","is_active":true,"title_en":"Confirm by email code","title_zh_hant":"以電郵驗證碼確認","body_en":"New email addresses are verified with a short code before they can protect your account.","body_zh_hant":"新電郵地址需先以短碼驗證，然後才能保護你的帳戶。"}
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
  select id from public.app_release_notes where version = '0.0.12'
);

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('email-password-sign-in', 'lock.fill', 'Sign in with email and password', '使用電郵和密碼登入', 'Save your Zona with an email address and password, then sign back in on another phone.', '使用電郵地址和密碼保存你的 Zona，然後在另一部手機重新登入。', 0),
    ('protect-guest', 'shield.fill', 'Protect a guest account', '保護訪客帳戶', 'If you started privately, you can now add an email and password without losing your sources or history.', '如果你以私人訪客身份開始，現在可以新增電郵和密碼，而不會遺失來源或紀錄。', 1),
    ('confirm-with-code', 'envelope.fill', 'Confirm by email code', '以電郵驗證碼確認', 'New email addresses are verified with a short code before they can protect your account.', '新電郵地址需先以短碼驗證，然後才能保護你的帳戶。', 2)
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
