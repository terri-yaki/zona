-- Backfill the customer-facing v0.0.9 release notes. The v0.0.9 feature
-- migration shipped without an app_release_notes entry, so the in-app
-- release screen skipped the version. Safe to run repeatedly.

insert into public.app_release_notes (
  version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant,
  legacy_items, is_active
) values (
  '0.0.9',
  '2026-08-01T13:00:00+00:00',
  'Every alert, accounted for',
  '每個通知，都有下落',
  'Check whether an alert reached your phone service, and see exactly how much of Zona you are using.',
  '查看通知是否已交到電話服務，並清楚知道自己使用了多少 Zona。',
  '[
    {"key":"follow-an-alert","icon":"paperplane.circle.fill","is_active":true,"title_en":"Follow each alert","title_zh_hant":"追蹤每個通知","body_en":"Open any alert to see whether it reached your phone service or is still on its way. The inbox copy is always safe.","body_zh_hant":"打開任何通知，即可查看它是否已交到電話服務或仍在途中。收件匣內的副本永遠安全。"},
    {"key":"plain-words-when-stuck","icon":"exclamationmark.circle.fill","is_active":true,"title_en":"Plain words when something sticks","title_zh_hant":"遇到問題，清楚說明","body_en":"If a delivery needs attention, Zona says why in plain language and keeps the full alert in your inbox.","body_zh_hant":"如果傳送需要留意，Zona 會以簡明文字說明原因，並把完整通知保留在收件匣。"},
    {"key":"see-your-usage","icon":"chart.bar.fill","is_active":true,"title_en":"See your usage","title_zh_hant":"查看用量","body_en":"Account now shows alerts from the past 24 hours and 7 days, plus sources, keys, phones, and attachment storage against their limits.","body_zh_hant":"帳戶頁現在顯示過去 24 小時及 7 天的通知數量，以及來源、金鑰、電話和附件儲存的用量與上限。"}
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
  select id from public.app_release_notes where version = '0.0.9'
);

with item_data(item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position) as (
  values
    ('follow-an-alert', 'paperplane.circle.fill', 'Follow each alert', '追蹤每個通知', 'Open any alert to see whether it reached your phone service or is still on its way. The inbox copy is always safe.', '打開任何通知，即可查看它是否已交到電話服務或仍在途中。收件匣內的副本永遠安全。', 0),
    ('plain-words-when-stuck', 'exclamationmark.circle.fill', 'Plain words when something sticks', '遇到問題，清楚說明', 'If a delivery needs attention, Zona says why in plain language and keeps the full alert in your inbox.', '如果傳送需要留意，Zona 會以簡明文字說明原因，並把完整通知保留在收件匣。', 1),
    ('see-your-usage', 'chart.bar.fill', 'See your usage', '查看用量', 'Account now shows alerts from the past 24 hours and 7 days, plus sources, keys, phones, and attachment storage against their limits.', '帳戶頁現在顯示過去 24 小時及 7 天的通知數量，以及來源、金鑰、電話和附件儲存的用量與上限。', 2)
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name, title_en, title_zh_hant, body_en,
  body_zh_hant, position, is_active
)
select release.id, item.item_key, item.icon_name, item.title_en,
  item.title_zh_hant, item.body_en, item.body_zh_hant, item.position, true
from item_data as item
join public.app_release_notes as release on release.version = '0.0.9'
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = true,
  updated_at = pg_catalog.now();
