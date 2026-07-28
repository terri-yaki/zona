-- Server-driven "What's New" content: release notes live in the database so
-- the app's changelog can be updated without shipping a new build. Writes stay
-- service-only (SQL editor / migrations); signed-in installs read.

create table public.app_changelog (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (char_length(btrim(version)) between 1 and 40),
  released_at timestamptz not null,
  title_en text not null check (char_length(btrim(title_en)) between 1 and 200),
  title_zh_hant text not null check (char_length(btrim(title_zh_hant)) between 1 and 200),
  summary_en text not null default '' check (char_length(summary_en) <= 500),
  summary_zh_hant text not null default '' check (char_length(summary_zh_hant) <= 500),
  -- Array of { "icon": "sparkles", "title_en": "…", "title_zh_hant": "…",
  --            "body_en": "…", "body_zh_hant": "…" } objects.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_changelog_released_idx on public.app_changelog(released_at desc);

alter table public.app_changelog enable row level security;

-- Changelog entries are app-wide content: every signed-in user (including
-- anonymous installs) may read them. No insert/update/delete policy — writes
-- are service-role only.
create policy "Authenticated users read the changelog"
  on public.app_changelog for select
  to authenticated
  using (true);

-- Seed with the release history that shipped in the bundled What's New copy.
insert into public.app_changelog (version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, items) values
  (
    '0.0.2',
    '2026-07-24T00:00:00+00:00',
    'Your notifications got more personal',
    '通知變得更有個性',
    'Pick a language, give each source its own voice, and keep an eye on things without opening the app.',
    '選擇語言、為每個來源配上不同聲音，甚至不用打開應用程式也能掌握動態。',
    '[
      {"icon":"globe","title_en":"Hello, 你好","title_zh_hant":"Hello，你好","body_en":"Added language support.","body_zh_hant":"增加語言支援"},
      {"icon":"rectangle.3.group.fill","title_en":"A glance is enough","title_zh_hant":"看一眼就夠","body_en":"Live Status can keep unread activity on your Lock Screen and Dynamic Island while Zona is running.","body_zh_hant":"Zona 運行時，即時動態可在鎖定畫面和動態島顯示未讀動態。"},
      {"icon":"speaker.wave.2.fill","title_en":"Give every source a voice","title_zh_hant":"讓每個來源都有自己的聲音","body_en":"Choose a different notification sound for each computer or app, then preview it with one tap.","body_zh_hant":"為每部電腦或應用程式選擇不同的通知音，點一下還可以即時試聽。"},
      {"icon":"bolt.fill","title_en":"Less waiting, more doing","title_zh_hant":"少一點等待，多一點俐落","body_en":"Faster loading.","body_zh_hant":"加速載入速度。"},
      {"icon":"photo.fill","title_en":"Upload photos","title_zh_hant":"可以上傳照片","body_en":"Notifications can include an image attachment, with a full-screen pinch-to-zoom viewer.","body_zh_hant":"通知現在可以附上圖片，並以全螢幕檢視器用雙指縮放查看。"}
    ]'::jsonb
  ),
  (
    '0.0.1',
    '2026-07-19T00:00:00+00:00',
    'Genesis',
    '創世紀',
    'One quiet home for notifications from every PC and local app you care about.',
    '把你在意的每部電腦和本機應用程式通知，安靜地集中在同一處。',
    '[
      {"icon":"desktopcomputer","title_en":"Every PC is welcome","title_zh_hant":"每部電腦都歡迎","body_en":"Connect multiple computers and always see exactly which source sent each notification.","body_zh_hant":"連接多部電腦，每則通知都會清楚標示來自哪個來源。"},
      {"icon":"tray.full.fill","title_en":"A tidy seven-day inbox","title_zh_hant":"整齊的七天信箱","body_en":"Filter by source, unread state, or the last 24 hours—and clear the noise when you are done.","body_zh_hant":"按來源、未讀狀態或過去 24 小時篩選，看完後也能輕鬆清走雜訊。"},
      {"icon":"key.fill","title_en":"Keys you control","title_zh_hant":"金鑰由你掌控","body_en":"Each source gets its own private API key, so it can be paused or revoked without disturbing the others.","body_zh_hant":"每個來源都有獨立的私人 API 金鑰，可以單獨暫停或撤銷，不影響其他來源。"}
    ]'::jsonb
  );
