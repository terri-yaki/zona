-- Add the "A fresh look" item to the live v0.0.7 What's New note without
-- rewriting an already-applied migration. Safe to run repeatedly.

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('fresh-look', 'paintbrush.fill', 'A fresh look', '煥然一新',
     'A brand-new logo, easier to spot on your Home Screen.',
     '全新標誌，主畫面一眼認出。', 4)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
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

update public.app_release_notes as release
set legacy_items = coalesce(release.legacy_items, '[]'::jsonb) || pg_catalog.jsonb_build_object(
      'key', 'fresh-look',
      'icon', 'paintbrush.fill',
      'is_active', true,
      'title_en', 'A fresh look',
      'title_zh_hant', '煥然一新',
      'body_en', 'A brand-new logo, easier to spot on your Home Screen.',
      'body_zh_hant', '全新標誌，主畫面一眼認出。'
    ),
    updated_at = pg_catalog.now()
where release.version = '0.0.7'
  and pg_catalog.jsonb_typeof(release.legacy_items) = 'array'
  and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(release.legacy_items) as item(value)
    where item.value ->> 'key' = 'fresh-look'
  );
