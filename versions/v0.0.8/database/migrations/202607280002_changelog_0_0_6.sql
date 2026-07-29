-- Seed the 0.0.6 release notes: operator-controlled limits, premium tiers,
-- and server-driven guide/retention values.

insert into public.app_changelog (
  version,
  released_at,
  title_en,
  title_zh_hant,
  summary_en,
  summary_zh_hant,
  items
) values (
  '0.0.6',
  '2026-07-28T08:00:00+00:00',
  'Operator controls and premium tiers',
  '營運端控制與進階方案',
  'Limits, retention, and the User Guide link are now controlled from the server, and premium tiers are ready behind the scenes.',
  '限制、保留天數與用戶指南連結現在由伺服器控制，進階方案也已預備就緒。',
  '[
    {"icon":"gearshape.2.fill","title_en":"Server-controlled limits","title_zh_hant":"由伺服器控制的限制","body_en":"The operator can change API-key caps, retention, rate limits, and attachment sizes with a SQL update—no app rebuild required.","body_zh_hant":"營運者只要更新 SQL 就能改變 API 金鑰上限、保留天數、速率限制與附件大小，無需重建 App。"},
    {"icon":"crown.fill","title_en":"Premium tier foundation","title_zh_hant":"進階方案基礎","body_en":"User accounts now carry premium state and subscription metadata, resolved server-side so clients can never upgrade themselves.","body_zh_hant":"用戶帳號現在帶有進階狀態與訂閱資料，並由伺服器端解析，用戶端無法自行升級。"},
    {"icon":"book.fill","title_en":"User Guide from the cloud","title_zh_hant":"雲端用戶指南","body_en":"Settings opens the operator-configured User Guide URL, with a fallback to the shipped default.","body_zh_hant":"設定頁現在會開啟營運者設定的用戶指南網址，離線時則使用預設值。"},
    {"icon":"clock.arrow.circlepath","title_en":"Dynamic retention display","title_zh_hant":"動態保留期限","body_en":"The Settings retention row shows the server-resolved window for your account tier.","body_zh_hant":"設定頁的保留期限會顯示你帳號等級對應的伺服器端數值。"}
  ]'::jsonb
)
on conflict (version) do update set
  released_at = excluded.released_at,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  summary_en = excluded.summary_en,
  summary_zh_hant = excluded.summary_zh_hant,
  items = excluded.items,
  updated_at = now();
