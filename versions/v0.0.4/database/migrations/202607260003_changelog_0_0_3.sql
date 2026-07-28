-- Seed the 0.0.3 release notes: ringtones, double-confirm deletion, and the
-- server-driven changelog itself. Newest released_at makes it the LATEST row.

insert into public.app_changelog (version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, items) values
  (
    '0.0.3',
    '2026-07-26T00:00:00+00:00',
    'Ringtones and a living changelog',
    '鈴聲與會更新的更新日誌',
    'Pick any classic iPhone ringtone for each source, and this What''s New screen now updates itself from the server.',
    '為每個來源選擇經典 iPhone 鈴聲，這個「新功能」頁面現在會自動從伺服器更新。',
    '[
      {"icon":"bell.fill","title_en":"Every iPhone ringtone","title_zh_hant":"全部 iPhone 鈴聲","body_en":"Choose from all 66 classic iPhone tones for each source.","body_zh_hant":"66 款經典 iPhone 鈴聲，每個來源任選。"},
      {"icon":"sparkles","title_en":"A changelog that updates itself","title_zh_hant":"自動更新的更新日誌","body_en":"Release notes are served from the cloud, so new entries appear without an app update.","body_zh_hant":"更新內容由雲端提供，新內容無需更新 App 即可顯示。"},
      {"icon":"hand.raised.fill","title_en":"Double-checked deletion","title_zh_hant":"刪除前再確認","body_en":"Deleting your account now asks twice before anything happens.","body_zh_hant":"刪除帳戶前現在需要確認兩次。"},
      {"icon":"number","title_en":"Fresh builds, numbered for you","title_zh_hant":"自動遞增的版本號","body_en":"Preview builds now auto-increment their build number.","body_zh_hant":"預覽版本現在會自動遞增版本號。"}
    ]'::jsonb
  );
