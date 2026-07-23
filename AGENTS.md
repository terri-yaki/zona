# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before
making changes.

## Project overview

Zona is a private, **pre-production** multi-source notification inbox for
iPhone. A local app on a PC sends an alert over HTTPS to an authenticated
Supabase Edge Function; the notification row is stored durably first, then Expo
Push Service / APNs delivers a best-effort push. The iPhone app keeps a
seven-day inbox synchronized over Supabase Realtime and row-level security.

The repository is a monorepo with three parts:

- `zona/` — Expo Router iPhone application (Expo SDK 54, React Native 0.81,
  React 19, TypeScript). Package name `zona-mobile`.
- `supabase/` — Postgres migrations, Edge Functions (Deno), and local
  `config.toml`.
- `examples/` — `send-notification.mjs` (Node) and `send-notification.ps1`
  (PowerShell) sender scripts that document the API contract.

Normative documentation lives in `docs/`: `PRD.md` (scope and release
blockers), `ARCHITECTURE.md` (data flow and invariants), `openapi.yaml` (Edge
Function contract), `TEST_PLAN.md` (release verification), `THREAT_MODEL.md`,
`RUNBOOK.md`, `RELEASE.md`, plus `docs/adr/0001-source-token-architecture.md`.
`SECURITY.md`, `PRIVACY.md`, and `CHANGELOG.md` (Keep a Changelog) are at the
root. The project is **not production-ready**: open release blockers are listed
in `CHANGELOG.md` and `docs/PRD.md` (placeholder bundle ID / EAS project UUID,
missing CI, incomplete inbox pagination, etc.).

## Architecture essentials

Request flow: sender → `notify` Edge Function (source Bearer token) →
security-definer Postgres function (hash lookup, per-source rate limit, atomic
insert) → best-effort Expo push → Realtime event to the app.

Key invariants (from `docs/ARCHITECTURE.md`) — do not break these:

- Senders never get a Supabase secret/service-role key and never write to
  tables directly. Source identity is derived **only** from the SHA-256 hash of
  the `zona_live_…` Bearer credential; payload fields cannot select owner or
  source.
- The notification row is inserted **before** any push call. Push is an
  optimization over the synchronized inbox, never the durable record.
- Source credentials are shown once and stored only as SHA-256 hashes.
  Notifications snapshot the source name at ingest time (renames do not
  rewrite history). Revoking one source never affects sibling sources.
- Every owner-facing table is protected by RLS. All Edge Functions have
  `verify_jwt = false` in `supabase/config.toml` — each handler **must**
  validate the Supabase user token (or source token) itself. This is a
  security-sensitive invariant.
- Expo SDK is pinned to 54; do not force-upgrade dependencies past it.

Database layout: `public.sources`, `public.push_devices`,
`public.notifications` (owner RLS) and `private.source_credentials`,
`private.ingest_requests`, `private.push_delivery_logs` (service-only). Writes
go through security-definer functions with fixed `search_path` and revoked
public execute. An hourly `pg_cron` job deletes expired notifications
(7 days) and old rate-limit rows (1 day). `notify` requires an
`Idempotency-Key` header (added in migration `202607200002`): identical
replays return the stored notification, and key reuse with a changed payload
returns 409.

### Mobile app layout (`zona/`)

- `app/` — Expo Router routes (typed routes enabled): `(tabs)/` inbox,
  sources, settings; `sign-in.tsx`, `push-onboarding.tsx`, `source/new.tsx`,
  `notification/[id].tsx`, `privacy.tsx`.
- `src/providers/AuthProvider.tsx` — session and app-wide lifecycle state.
- `src/lib/` — `supabase.ts` (public client, anonymous auth), `api.ts` (Edge
  Function transport), `push.ts`, `auth-storage.ts`,
  `env.ts`, `validation.ts`, `errors.ts`, `format.ts`,
  `pending-notification.ts`.
- `src/data/` — `notifications.ts`, `sources.ts` (query layer).
- `src/hooks/` — `useInbox.ts`, `useSources.ts`.
- `src/components/` — presentation-only controls.
- `src/types/database.ts` — Supabase database types; `src/types.ts` re-exports
  domain types. Path alias `@/*` → `src/*`.

Keep transport/persistence out of screens: presentation in `app/` and
`components/`, data access in `data/`/`hooks/`, transport in `lib/`.

### Edge Functions layout (`supabase/functions/`)

`create-source`, `manage-source`, `register-push-token`, `notify`,
`delete-account`, plus `_shared/` (`cors.ts`, `crypto.ts`, `http.ts`,
`push.ts`, `supabase.ts`, `validation.ts` — with `*_test.ts` unit tests). The
`_shared/supabase.ts` client accepts both current
(`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`) and legacy
(`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) secret names.

## Build and test commands

Mobile app (from `zona/`):

```sh
npm ci
npm start              # expo start (dev server)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm test               # vitest run (src/__tests__)
npx expo install --check
npx expo-doctor
npx expo export --platform ios --output-dir dist
```

Backend (from repo root, requires pinned Deno + Supabase CLI):

```sh
deno fmt --check supabase/functions
deno lint supabase/functions
deno check supabase/functions/*/index.ts
deno test supabase/functions
supabase start && supabase db reset    # local stack
```

Deploy (from repo root):

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-source manage-source register-push-token notify
```

Also enable anonymous sign-ins in Authentication → Providers (the app uses
`signInAnonymously`; see `docs/adr/0002-anonymous-sign-in.md` and
`supabase/README.md`). iOS builds use EAS (`zona/eas.json`:
`preview` internal builds, `production` with auto-incremented build numbers).
There is no CI configuration in the repo yet — `docs/TEST_PLAN.md` defines the
required gates.

## Code style guidelines

- TypeScript strict mode everywhere. Mobile app uses ESLint flat config
  (`eslint-config-expo`); Edge Functions use `deno fmt` (line width 140,
  single quotes) and `deno lint`.
- Expo app imports use the `@/` alias for `src/`.
- Documentation and code comments are in English; match the existing
  sober, precise documentation tone.
- Migrations are forward-only — do not fold changes into an already-applied
  migration (see the header of `202607200002_production_hardening.sql`).
- Record notable changes in `CHANGELOG.md` (Keep a Changelog format).
- Architectural changes that touch tokens, auth, RLS, or retention require an
  ADR and threat-model update, not just code.

## Testing instructions

- Mobile unit tests: Vitest in `zona/src/__tests__/` (globals enabled via
  tsconfig types). Run `npm test` in `zona/`.
- Edge Function unit tests: `deno test supabase/functions` — pure-function
  tests live beside the code as `*_test.ts` in `_shared/`.
- `docs/TEST_PLAN.md` is the release contract: it additionally requires
  pgTAP-style database/RLS tests, Edge Function contract tests against
  `docs/openapi.yaml`, multi-source E2E tests, and a physical-iPhone
  TestFlight matrix. Push and APNs behavior can **only** be verified on a
  physical iPhone with a development/TestFlight build — Expo Go results do
  not count as push evidence.
- Boundary tests must use byte length (UTF-8), not JS string length; notify
  limits are title 120 chars, body 2 000 chars, category 80 chars, metadata
  object ≤ 4 KiB.

## Security considerations

- Never commit or log: Supabase secret/service-role keys, `zona_live_…`
  source tokens, user session tokens, or push tokens. The Expo
  app may contain only `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (copy `zona/.env.example` to
  `zona/.env`).
- `.env` files are gitignored; never put production secrets in local env
  files.
- Error responses from Edge Functions must not leak stack traces, SQL
  details, tokens, or notification content.
- Preserve the security invariants listed above: hashed credentials,
  durable-before-push, RLS everywhere, per-function auth validation,
  bounded payloads, per-source rate limiting (60/min per source, 300/min per
  account).
- PC remote control is explicitly out of scope for v1; do not add command
  channels or reuse the notification token for anything but ingestion.
- Follow `SECURITY.md` for credential rotation/incident procedures and the
  dependency policy (no critical/high findings ship; no silent upgrades past
  SDK 54).
