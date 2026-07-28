# DB migration checklist (agent-facing)

Run this checklist before any `supabase db push` or merge to `main` that
carries a migration. The Deploy DB workflow applies whatever lands on `main`,
so a mistake on `main` is a mistake in production within a minute.

Migrations only change the **database**. They never bump the app version —
`zona/app.json`'s `version` is edited separately (or via
`eas build:version:set`); the `version` column in `app_release_notes` is a
release-notes label, not the binary version. A release usually needs both:
app.json bump **and** a changelog migration with the matching label.

## 1. Before writing

- [ ] Read the existing migrations. New file = `supabase/migrations/YYYYMMDDHHNNN_<slug>.sql`
      with the next sequence. **Never edit an already-applied migration** —
      fixes are new forward-only migrations.
- [ ] Confirm the change belongs in the DB (schema, constraint, RLS, seed
      content) and not in app code.

## 2. Writing the migration

- [ ] **Idempotent where possible**: `drop ... if exists`, `on conflict do
      nothing`, `create or replace`. CI and re-runs must be safe.
- [ ] **Data rewrite before constraint tightening**: `update` legacy values
      first (e.g. `set sound_name = 'default' where ...`), then drop/re-add
      the check constraint, so it applies cleanly on live data.
- [ ] **RLS on every new table**: `enable row level security`; select policies
      as narrow as the feature needs; no insert/update/delete policies unless
      clients must write (writes are service-only by default here).
- [ ] **Security-definer functions**: fixed `search_path = ''`, bodies qualify
      real functions as `pg_catalog.*`, and execute grants are explicit.
      Service internals grant only `service_role`; authenticated owner RPCs
      derive the owner from `auth.uid()` and must test cross-account denial.
- [ ] **SQL gotchas that have bitten this repo**: `coalesce`, `greatest`,
      `least`, `nullif` are keywords/constructs — **never** schema-qualify
      them (`pg_catalog.coalesce(...)` fails with 42883). `now()`, `count`,
      `jsonb_build_object` etc. are real functions and may be qualified.
- [ ] **Limits use byte length** (UTF-8), not JS string length, where the app
      contract says so (title 120, body 2000, category 80, metadata ≤ 4 KiB).
- [ ] **No secrets**: no tokens, passwords, service keys, or user data in
      migrations. Seed content only (e.g. changelog rows) — bilingual
      (`*_en` + `*_zh_hant`), normalized items per `docs/APP_CHANGELOG.md`, and
      `released_at` chosen deliberately (it controls the LATEST badge).
- [ ] **Data API grants are explicit**: creating an object in `public` does not
      imply anonymous or authenticated access. Revoke broad defaults and grant
      only the roles that need the table, view, or function.
- [ ] **Compatibility renames**: do not replace a client-writable table or a
      Realtime table subscription with a view while an installed binary still
      depends on it. Introduce a canonical security-invoker view, owner RPCs,
      and Broadcast topics first; physically rename after the minimum-build
      cutover. Read-only surfaces may be renamed with a compatibility view.

## 3. Before pushing

- [ ] Local gates green: `deno fmt --check`, `deno lint`, `deno check`,
      `deno test` for `supabase/functions`; `npm run typecheck`,
      `npm run lint`, `npm test` in `zona/` when app code changed.
- [ ] `npx supabase migration list` shows local and remote ledgers sane — no
      unexpected "remote only" or "local only" rows. If the remote ledger was
      repaired by hand, verify the schema actually matches before pushing.
- [ ] If a local stack is available (`supabase start`), prove it with
      `supabase db reset` first. Otherwise re-read the SQL top to bottom as
      the reviewer.

## 4. After the push (manual or CI)

- [ ] Confirm the apply: check the workflow run (Actions → Deploy DB) or the
      `db push` output — "Applying migration …" then "Finished".
- [ ] **Verify the effect remotely, don't assume**: probe via REST/RPC
      (anonymous-session queries work for read paths). Examples: select the
      new row, attempt a write the constraint should reject, call the RPC
      path end to end.
- [ ] If verification fails, fix forward (new migration), then re-verify.
      Do not hand-edit applied migration files to match.

## 5. Commit hygiene

- [ ] Commit the migration with the app/docs changes that belong with it;
      message follows repo style (`feat:` / `fix:` / `test:` / `docs:`).
- [ ] Update `CHANGELOG.md` (Keep a Changelog) and any affected doc in
      `docs/` in the same commit or a sibling commit.
