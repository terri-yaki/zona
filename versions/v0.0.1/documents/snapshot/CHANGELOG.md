# Changelog

All notable changes to Zona are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure and intends
to use semantic application versions. Build numbers are managed by EAS.

## [Unreleased]

### Added

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
- Per-source notification sound presets (default, silent, soft, bright, and
  urgent) with three bundled iOS sound assets.

### Changed

- Replaced email magic-link sign-in with Supabase Auth anonymous sign-in; no
  email, password, or SMTP provider is required, and signing out an anonymous
  account now carries an explicit permanence warning (see ADR 0002).
- API-key listing now uses one owner-isolated view query, screens preload and
  cache by account, and routine key creation/management uses authenticated
  PostgREST RPCs to avoid Edge Function cold-start delays.

### Security

- Documented source-token and Supabase secret rotation/incident procedures.
- Made privacy policy, account deletion, cross-tenant tests, dependency review,
  monitoring, and physical-device TestFlight evidence explicit release gates.
- Production-hardening migration `202607200002`: owner-matching composite
  foreign keys, advisory locks serializing revoke against ingest, and
  idempotency constraints; sender examples now send `Idempotency-Key`.

### Known release blockers

- Replace placeholder iOS bundle identifier and EAS project UUID.
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
