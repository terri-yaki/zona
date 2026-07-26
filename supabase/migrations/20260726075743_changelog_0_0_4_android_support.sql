-- Seed the 0.0.4 Android compatibility release notes.

insert into public.app_changelog (
  version,
  released_at,
  title_en,
  title_zh_hant,
  summary_en,
  summary_zh_hant,
  items
) values (
  '0.0.4',
  '2026-07-26T07:57:43+00:00',
  'Zona now supports Android!',
  'Zona 現已支援 Android！',
  'The same calm multi-source inbox now feels at home on Android.',
  '熟悉的多來源通知收件匣，現在也能自然地在 Android 上使用。',
  '[
    {"icon":"cell_tower","title_en":"Android has joined the party","title_zh_hant":"Android 加入了","body_en":"Receive source-aware Zona alerts through Android notification channels.","body_zh_hant":"透過 Android 通知頻道接收清楚標示來源的 Zona 通知。"},
    {"icon":"notifications_active","title_en":"A sound for every source","title_zh_hant":"每個來源都有自己的聲音","body_en":"Choose or silence each source in Android''s native notification settings.","body_zh_hant":"在 Android 原生通知設定中，為每個來源選擇鈴聲或設為靜音。"},
    {"icon":"auto_awesome","title_en":"Made to feel native","title_zh_hant":"更貼近原生體驗","body_en":"Safe areas, system bars, tabs, icons, and keyboards now fit Android properly.","body_zh_hant":"安全區域、系統列、分頁、圖示和鍵盤現在都更符合 Android 的使用方式。"}
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
