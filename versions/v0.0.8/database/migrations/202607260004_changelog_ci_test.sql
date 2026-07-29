-- CI pipeline test entry for app_changelog: verifies the Deploy DB workflow
-- applies migrations automatically on push to main. Dated 2026-07-01 so it
-- sorts below the real releases. Safe to delete manually from the dashboard.

insert into public.app_changelog (version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, items) values
  (
    '0.0.0-ci-test',
    '2026-07-01T00:00:00+00:00',
    'CI pipeline test entry',
    'CI 流程測試項目',
    'This entry was added automatically by the Deploy DB workflow. Safe to delete.',
    '此項目由 Deploy DB 工作流程自動加入，可以刪除。',
    '[
      {"icon":"checkmark.circle.fill","title_en":"It works","title_zh_hant":"成功","body_en":"This migration was applied by GitHub Actions, not by hand.","body_zh_hant":"此遷移由 GitHub Actions 自動套用。"}
    ]'::jsonb
  );
