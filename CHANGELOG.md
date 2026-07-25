# Changelog

All notable changes to Zona are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure and intends
to use semantic application versions. Build numbers are managed by EAS.

## [Unreleased]

### Added

- Friendly in-app “What’s New” history in Settings, with user-focused release
  highlights in English and Traditional Chinese.
- English and Traditional Chinese app languages, with automatic system-language
  detection, an immediate in-app language selector, localized relative times,
  validation/errors, update prompts, notification sound previews, and Live
  Status text. The preference is stored per installation.
- iOS **Live Status** Live Activity (Lock Screen + Dynamic Island): optional
  Settings toggle backed by `app_options.live_activity_enabled` (migration
  `202607240005`), unread count + latest alert while the app can run JS, Zona
  monogram assets, and `docs/LIVE_ACTIVITY.md`. Requires a new preview/native
  build (`expo-live-activity` plugin); not available in Expo Go. App-driven
  updates only in v1 (stale if the app is killed until next open).
- Public App Store launch and monetization roadmap covering product validation,
  recoverable paid accounts, StoreKit entitlements, economic quotas, hosting,
  DevOps, observability, and measured scaling triggers.
- Preview OTA via EAS Update (`channel: preview`), in-app update prompt, Settings
  “Check for app update”, and `docs/PREVIEW_UPDATES.md` developer/user guide.
- Production-readiness product requirements, architecture, test plan, threat
  model, runbook, release procedure, privacy draft, security policy, ADR, and
  OpenAPI contract.
- Required `Idempotency-Key` header on `notify`: identical replays return the
  stored notification (`200`, `idempotentReplay: true`) without a duplicate
  row or repeated push; key reuse with a changed payload returns
  `409 IDEMPOTENCY_CONFLICT`.
- Per-account ingestion rate limit (300/minute) alongside the 60/minute
  per-source limit, plus account caps of 100 active sources, 10 source
  creations/hour, 10 active push devices, and 120 device registrations/hour.
- `delete-account` Edge Function that removes owned rows and then the Auth
  user via the admin API.
- Cursor-paginated inbox with a "Last 24 hours" date filter so retained
  records beyond the first page remain reachable.
- `npm run check:sdk54` and `npm run release:check` release-gate scripts.
- Push-device lifecycle hardening: `DeviceNotRegistered` tickets disable the
  device, token format is validated in the database, and long-disabled
  devices are removed by the hourly cleanup.
- Owner-visible API-key metadata, pause/resume controls, server-backed push
  options, and a reusable per-source test-alert action.
- Per-source notification sound presets (default, silent, soft, bright, urgent,
  chime, crystal, warm, pulse, signal, and bloom) with bundled iOS sound assets.

### Changed

- Restyled the Live Status Live Activity as a count-forward glance card:
  deep-green surface, an `N unread · latest title` headline, a source +
  "updated Xm" subline, and no 8-hour session countdown (an Apple lifetime
  artifact that dominated the Lock Screen strip and every Dynamic Island
  region). Installed activities restart once to pick up the new theme.
- Closed the bundle identifier / EAS project UUID release blocker: `app.json`
  carries the owned `com.terriyaki.zona` identifier and the linked
  `terriyaki/zona` EAS project UUID (verified against the Expo API), and the
  PRD, release procedure, and app README no longer list them as outstanding.
- Replaced email magic-link sign-in with Supabase Auth anonymous sign-in; no
  email, password, or SMTP provider is required, and signing out an anonymous
  account now carries an explicit permanence warning (see ADR 0002).
- API-key listing now uses one owner-isolated view query, screens preload and
  cache by account, and routine key creation/management uses authenticated
  PostgREST RPCs to avoid Edge Function cold-start delays.
- The PowerShell sender uses `HttpClient` for multipart attachments so image
  uploads work in both Windows PowerShell 5.1 and PowerShell 7.

### Security

- Documented source-token and Supabase secret rotation/incident procedures.
- Made privacy policy, account deletion, cross-tenant tests, dependency review,
  monitoring, and physical-device TestFlight evidence explicit release gates.
- Production-hardening migration `202607200002`: owner-matching composite
  foreign keys, advisory locks serializing revoke against ingest, and
  idempotency constraints; sender examples now send `Idempotency-Key`.
- Account deletion hardening (migration `202607250001`): a security-definer
  `delete_account_data_internal` revokes every API key and source under an
  advisory lock before removing rows and returns a per-table deletion audit;
  `delete-account` now also purges Storage attachments, requires the client to
  pass the expected account ID (409 on mismatch), and verifies the Auth user
  is actually gone before reporting success. Settings refuses to sign out
  unless the server confirms deletion of the exact signed-in account, fixing
  deleted accounts whose keys kept working because the Auth user survived.

### Known release blockers

- Complete EAS production environment, Apple/APNs, privacy and
  support URLs, App Store metadata/assets, monitoring owners,
  CI/integration tests, and signed TestFlight verification.
- Resolve or approve a time-bounded mitigation for outstanding SDK-54
  dependency advisories without forcing an unplanned SDK upgrade.

## [0.1.0] - 2026-07-20

### Added

- Private Expo Router iPhone prototype on Expo SDK 54.
- Supabase email magic-link authentication, row-level security, realtime inbox,
  source creation/rename/revocation, iPhone push registration, and seven-day
  cleanup migration.
- Direct per-source notification ingestion with hashed credentials, source-name
  snapshots, bounded payload validation, per-source rate limiting, durable-first
  storage, best-effort Expo push, and delivery-attempt logging.
- Source and unread filters, notification detail/read/delete flows, and basic
  Node.js and PowerShell sender examples.

### Changed

- Replaced the original .NET Windows companion, loopback listener, and
  QR/manual pairing-code plan with direct hosted API calls using independent
  source credentials. See ADR 0001.

### Limitations

- This version is a pre-production prototype and has not completed the release
  evidence required by `docs/PRD.md` and `docs/RELEASE.md`.
