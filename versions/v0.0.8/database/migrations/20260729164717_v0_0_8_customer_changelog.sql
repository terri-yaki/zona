-- Apply the edited v0.0.7 wording without rewriting an already-applied
-- migration. This remains safe to run repeatedly.
update public.app_release_note_items as item
set title_zh_hant = '即開即用',
    updated_at = pg_catalog.now()
from public.app_release_notes as release
where item.release_id = release.id
  and release.version = '0.0.7'
  and item.item_key = 'open-and-go'
  and item.title_zh_hant is distinct from '即開即用';

update public.app_release_notes as release
set legacy_items = (
      select pg_catalog.jsonb_agg(
        case when item.value ->> 'key' = 'open-and-go'
          then pg_catalog.jsonb_set(item.value, '{title_zh_hant}', '"即開即用"'::jsonb)
          else item.value
        end order by item.ordinality
      )
      from pg_catalog.jsonb_array_elements(release.legacy_items)
        with ordinality as item(value, ordinality)
    ),
    updated_at = pg_catalog.now()
where release.version = '0.0.7'
  and pg_catalog.jsonb_typeof(release.legacy_items) = 'array'
  and exists (
    select 1
    from pg_catalog.jsonb_array_elements(release.legacy_items) as item(value)
    where item.value ->> 'key' = 'open-and-go'
      and item.value ->> 'title_zh_hant' is distinct from '即開即用'
  );

insert into public.app_release_notes (
  version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant,
  legacy_items, is_active
) values (
  '0.0.8',
  '2026-07-29T16:00:00+00:00',
  'Your Zona comes with you',
  '你的 Zona，隨時跟你走',
  'Protect the Zona you have built, bring it to a new phone, and change a sender key without starting over.',
  '保護你建立好的 Zona，換手機後也能繼續使用，傳送端金鑰亦可隨時安全更換。',
  '[
    {"key":"recover-anywhere","icon":"arrow.clockwise.icloud.fill","is_active":true,"title_en":"Pick up on a new phone","title_zh_hant":"換手機也能接續使用","body_en":"Protect your Zona, sign in again, and your sources and recent inbox are ready to meet you.","body_zh_hant":"保護你的 Zona，再次登入後，來源和最近的通知都會準備好迎接你。"},
    {"key":"sign-in-your-way","icon":"person.badge.key.fill","is_active":true,"title_en":"Sign in your way","title_zh_hant":"用喜歡的方式登入","body_en":"Choose email, Apple, Google, or GitHub, then add another method for extra peace of mind.","body_zh_hant":"你可以選擇電郵、Apple、Google 或 GitHub，也可多加一種方式，令帳戶更安心。"},
    {"key":"rotate-without-restarting","icon":"key.horizontal.fill","is_active":true,"title_en":"Change a key, keep everything else","title_zh_hant":"更換金鑰，其他照舊","body_en":"Give scripts and agents their own keys, replace one safely, and keep the same source name, sound, filters, and history.","body_zh_hant":"腳本和代理程式可以各用一把金鑰，安全更換其中一把時，來源名稱、提示音、篩選和記錄都保持不變。"}
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
  is_active = excluded.is_active,
  updated_at = pg_catalog.now();

update public.app_release_note_items
set is_active = false,
    updated_at = pg_catalog.now()
where release_id = (
  select id from public.app_release_notes where version = '0.0.8'
);

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('recover-anywhere', 'arrow.clockwise.icloud.fill', 'Pick up on a new phone', '換手機也能接續使用', 'Protect your Zona, sign in again, and your sources and recent inbox are ready to meet you.', '保護你的 Zona，再次登入後，來源和最近的通知都會準備好迎接你。', 0),
    ('sign-in-your-way', 'person.badge.key.fill', 'Sign in your way', '用喜歡的方式登入', 'Choose email, Apple, Google, or GitHub, then add another method for extra peace of mind.', '你可以選擇電郵、Apple、Google 或 GitHub，也可多加一種方式，令帳戶更安心。', 1),
    ('rotate-without-restarting', 'key.horizontal.fill', 'Change a key, keep everything else', '更換金鑰，其他照舊', 'Give scripts and agents their own keys, replace one safely, and keep the same source name, sound, filters, and history.', '腳本和代理程式可以各用一把金鑰，安全更換其中一把時，來源名稱、提示音、篩選和記錄都保持不變。', 2)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.8'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = pg_catalog.now();
