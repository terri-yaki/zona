# App changelog ("What's New") content guide

Zona v0.0.6 stores release headings and feature cards separately so every
item can be published, hidden, ordered, scheduled, and platform-targeted
without rewriting a JSON array.

## Tables

`public.app_release_notes` contains one row per version:

| Column | Rules |
| --- | --- |
| `version` | Unique display version such as `0.0.6` |
| `released_at` | Controls newest-first order and the Latest badge |
| `title_en`, `title_zh_hant` | Required localized release title |
| `summary_en`, `summary_zh_hant` | Localized summary |
| `is_active` | Master publish switch for the release |
| `starts_at`, `expires_at` | Optional publish window |

`public.app_release_note_items` contains the cards:

| Column | Rules |
| --- | --- |
| `release_id` | Parent release UUID, cascade delete |
| `item_key` | Stable unique key within the release |
| `icon_name` | SF Symbol name; unknown names degrade gracefully |
| `title_en`, `title_zh_hant` | Localized card title; English is required |
| `body_en`, `body_zh_hant` | Localized card body |
| `position` | Zero-based order within the release |
| `is_active` | Independent item publish switch |
| `platform` | Optional `ios`, `android`, or `web` target |
| `starts_at`, `expires_at` | Optional item publish window |

RLS exposes only active, currently scheduled rows and items to authenticated
installs. The app also filters defensively. A successful empty result is
authoritative; bundled content is used only after a real fetch failure, so
turning everything off does not make old notes reappear.

## Publishing a release

Create a forward-only migration with a release row followed by its items:

```sql
with release as (
  insert into public.app_release_notes (
    version, released_at,
    title_en, title_zh_hant,
    summary_en, summary_zh_hant,
    legacy_items, is_active
  ) values (
    'X.Y.Z',
    '2026-MM-DDT00:00:00Z',
    'A human release title', '自然的繁體中文標題',
    'One friendly sentence.', '一句自然、友善的繁體中文摘要。',
    '[]'::jsonb,
    true
  )
  on conflict (version) do update set
    released_at = excluded.released_at,
    title_en = excluded.title_en,
    title_zh_hant = excluded.title_zh_hant,
    summary_en = excluded.summary_en,
    summary_zh_hant = excluded.summary_zh_hant,
    is_active = excluded.is_active,
    updated_at = now()
  returning id
)
insert into public.app_release_note_items (
  release_id, item_key, icon_name,
  title_en, title_zh_hant,
  body_en, body_zh_hant,
  position, is_active
)
select
  release.id, 'feature-key', 'sparkles',
  'Feature name', '功能名稱',
  'What this does for the user.', '這項功能為使用者帶來甚麼。',
  0, true
from release
on conflict (release_id, item_key) do update set
  icon_name = excluded.icon_name,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  body_en = excluded.body_en,
  body_zh_hant = excluded.body_zh_hant,
  position = excluded.position,
  is_active = excluded.is_active,
  updated_at = now();
```

Use `npx supabase migration new <slug>` to create the migration. Merge to
`main` only after the DB checklist passes; the Deploy DB workflow publishes
it, and the app sees it on the next What's New open.

## Common edits

Hide one card without hiding the release:

```sql
update public.app_release_note_items
set is_active = false
where release_id = (
  select id from public.app_release_notes where version = '0.0.6'
)
and item_key = 'feature-key';
```

Hide a whole release:

```sql
update public.app_release_notes
set is_active = false
where version = '0.0.6';
```

Prefer deactivation to deletion. The migration ledger records that a seed ran;
deleting content does not make that migration run again. A later idempotent
upsert is required to restore a manually deleted row.

## Writing rules

The full editorial standard and v0.0.6 reference are in
[`CHANGELOG_WRITING.md`](CHANGELOG_WRITING.md). In short, What's New describes
the result a person experiences, not the mechanism used to build it.

- Write for people, not the commit log: one benefit per card, usually 1–4
  cards per release.
- Turn technical capacity into a concrete outcome a person can picture.
- Keep schema, migration, RPC, RLS, cache, bootstrap, and other implementation
  terms out of in-app copy.
- Do not publish invisible foundations or unfinished work as user features.
- Avoid promises such as instant or guaranteed unless they are true in every
  supported condition.
- Keep English and Traditional Chinese together. Empty Traditional Chinese
  text falls back to English, but published notes should translate both.
- Use full-width Traditional Chinese punctuation: `，` and `。`. Do not place
  a full stop in the middle of one continuing Chinese sentence.
- Escape SQL apostrophes by doubling them (`What''s New`).
- Use stable `item_key` values so future migrations update instead of duplicate.
- Do not create platform-scoped items until the v0.0.5 compatibility view is
  retired; an old client cannot supply platform context to that view.

## Compatibility

`public.app_changelog` is now a read-only security-invoker compatibility view
that rebuilds the old `items` JSON from active normalized cards. This keeps
v0.0.5 readable while v0.0.6 queries `app_release_notes` and
`app_release_note_items` directly.
