# App changelog ("What's New") content guide

How release notes for the in-app **What's New** screen are authored, stored,
and published. Read this before adding an entry.

## The pipeline

1. Author a forward-only SQL migration that inserts one row into
   `public.app_changelog` (template below).
2. Merge it to `main`. The **Deploy DB** GitHub Actions workflow applies it to
   the live project automatically (`supabase db push`).
3. Every install picks the entry up the next time **Settings → What's New**
   opens. No app build, no OTA update, no App Store review.
4. If the fetch fails (offline, unmigrated backend), the screen silently falls
   back to the bundled copy in `zona/src/content/whats-new.ts`.

Rows are rendered newest-first by `released_at`; the newest row gets the
**LATEST** badge. Entries can be edited or deleted anytime from the Supabase
Dashboard table editor (`app_changelog`) — the screen reflects changes on the
next open.

## Row format

| Column | Rules |
| --- | --- |
| `version` | unique, e.g. `'0.0.3'`. Shown as `v0.0.3`. Use a clearly fake value (e.g. `'0.0.0-test'`) for test entries. |
| `released_at` | timestamptz. Drives ordering and the LATEST badge. Date the entry when you want it to sort. |
| `title_en` / `title_zh_hant` | required, ≤ 200 chars each. Release title in both languages. |
| `summary_en` / `summary_zh_hant` | optional (default `''`), ≤ 500 chars. One-line summary. |
| `items` | JSONB array of feature cards (see below). May be empty. |

Each item:

```json
{
  "icon": "bell.fill",
  "title_en": "Every iPhone ringtone",
  "title_zh_hant": "全部 iPhone 鈴聲",
  "body_en": "Choose from all 66 classic iPhone tones for each source.",
  "body_zh_hant": "66 款經典 iPhone 鈴聲，每個來源任選。"
}
```

- `icon` — any SF Symbol name (e.g. `bell.fill`, `sparkles`, `hand.raised.fill`).
  Unknown names degrade to a dot fallback.
- `title_en` — required per item; items without it are dropped client-side.
- Missing/empty `*_zh_hant` strings fall back to the English text automatically.
- Malformed rows (bad date, blank English title) are dropped client-side, so a
  bad entry degrades gracefully instead of breaking the screen.

## Entry template

```sql
-- Release notes for vX.Y.Z. Newest released_at makes it the LATEST row.

insert into public.app_changelog (version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, items) values
  (
    'X.Y.Z',
    '2026-MM-DDT00:00:00+00:00',
    'English release title',
    '繁體中文標題',
    'One-line English summary.',
    '一行中文摘要。',
    '[
      {"icon":"sparkles","title_en":"Feature name","title_zh_hant":"功能名稱","body_en":"What it does for the user.","body_zh_hant":"為使用者帶來甚麼。"}
    ]'::jsonb
  );
```

Name the file `YYYYMMDDHHNNN_<slug>.sql` under `supabase/migrations/` (next
sequence after the latest migration), commit, and merge to `main`.

## Authoring rules

- Write for the user, not the commit log: 1–5 items, each one benefit, short
  bodies. Match the sober, friendly tone of the existing entries.
- Both languages, always — the catalogs test en/zh-Hant parity elsewhere, and
  the screen renders whichever language the user picked.
- Mind Traditional Chinese punctuation: full-width `，` and `。`, no mid-sentence
  `。` (the app reuses catalog conventions).
- Escape single quotes in SQL by doubling them (`What''s New`).
- Migrations are forward-only: to fix a published entry, either edit the row in
  the Dashboard (content fix) or ship a new migration that `update`s the row
  (keeps fresh databases consistent).
- The migration ledger records the insert; deleting a row in the Dashboard
  removes the content but not the ledger entry.

## Reference examples

- Table definition + first seeds: `supabase/migrations/202607250004_app_changelog.sql`
- A real entry: `supabase/migrations/202607260003_changelog_0_0_3.sql`
- Client validation/mapping (source of truth for what renders):
  `zona/src/lib/changelog.ts` (`parseChangelogRows`)
