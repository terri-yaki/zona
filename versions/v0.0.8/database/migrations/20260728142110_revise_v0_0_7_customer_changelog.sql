-- Keep v0.0.7 customer release notes benefit-led and exclude operator-only
-- reporting from both normalized and legacy changelog readers.

update public.app_release_notes
set title_en = 'Your inbox is ready when you are',
    title_zh_hant = '一打開，信箱已經準備好',
    summary_en = 'Open Zona and your recent alerts are already waiting—even when the connection isn’t.',
    summary_zh_hant = '打開Zona，最近的通知已經在等你，即使網絡不穩，也能繼續查看。',
    legacy_items = '[
      {"key":"open-and-go","icon":"bolt.fill","is_active":true,"title_en":"Open and get moving","title_zh_hant":"打開就能行動","body_en":"Your recent alerts appear right away, so you can act without waiting on a loading screen.","body_zh_hant":"最近的通知立即出現，不用等載入畫面，就能馬上處理。"},
      {"key":"between-connections","icon":"tray.full.fill","is_active":true,"title_en":"Still useful offline","title_zh_hant":"離線仍然有用","body_en":"Read recent alerts between connections, then let Zona quietly catch up when you’re back online.","body_zh_hant":"網絡中斷時仍可查看最近通知，重新連線後，Zona會在背景悄悄追上。"},
      {"key":"account-private","icon":"person.crop.circle.fill","is_active":true,"title_en":"Saved only for you","title_zh_hant":"只為你儲存","body_en":"Your saved inbox stays separate from every other account and disappears from the phone when you sign out.","body_zh_hant":"每個帳戶的信箱各自分開，登出後，已儲存內容也會從手機移除。"},
      {"key":"cache-control","icon":"internaldrive","is_active":true,"title_en":"You decide what stays","title_zh_hant":"由你決定保留甚麼","body_en":"See how much space Zona uses and clear saved content anytime from Settings.","body_zh_hant":"在設定中查看Zona佔用的空間，也可以隨時清除已儲存內容。"}
    ]'::jsonb,
    updated_at = pg_catalog.now()
where version = '0.0.7';

update public.app_release_note_items
set is_active = false,
    updated_at = pg_catalog.now()
where release_id = (
  select id from public.app_release_notes where version = '0.0.7'
);

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('open-and-go', 'bolt.fill', 'Open and get moving', '打開就能行動', 'Your recent alerts appear right away, so you can act without waiting on a loading screen.', '最近的通知立即出現，不用等載入畫面，就能馬上處理。', 0),
    ('between-connections', 'tray.full.fill', 'Still useful offline', '離線仍然有用', 'Read recent alerts between connections, then let Zona quietly catch up when you’re back online.', '網絡中斷時仍可查看最近通知，重新連線後，Zona會在背景悄悄追上。', 1),
    ('account-private', 'person.crop.circle.fill', 'Saved only for you', '只為你儲存', 'Your saved inbox stays separate from every other account and disappears from the phone when you sign out.', '每個帳戶的信箱各自分開，登出後，已儲存內容也會從手機移除。', 2),
    ('cache-control', 'internaldrive', 'You decide what stays', '由你決定保留甚麼', 'See how much space Zona uses and clear saved content anytime from Settings.', '在設定中查看Zona佔用的空間，也可以隨時清除已儲存內容。', 3)
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
join public.app_release_notes as release on release.version = '0.0.7'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = pg_catalog.now();
