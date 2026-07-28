# Changelog

All notable changes to Zona are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure and intends
to use semantic application versions. Build numbers are managed by EAS.

## [Unreleased]

### Added

- Server-driven What's New: release notes now live in a new
  `public.app_changelog` table (migration `202607250004`, RLS read for
  signed-in installs, writes service-only) seeded with the 0.0.1/0.0.2
  history in English and Traditional Chinese. The screen fetches it on open
  — so changelog content can be updated without shipping an app build — and
  falls back to the bundled copy when the table is unreachable or empty.
- Preview builds now auto-increment the remote iOS build number
  (`eas.json` `preview.autoIncrement`), matching the production profile.
- Settings → "Delete account and data" now requires two consecutive explicit
  confirmations before any delete request fires: the first dialog explains
  the permanent deletion, the second is the final confirmation, and canceling
  either aborts the flow. The gating logic is a pure, unit-tested state
  machine (`delete-confirmation.ts`); the destructive call is only reachable
  from the doubly-confirmed state.

### Fixed

- Live backend repairs applied during the migration deploy: restored the
  missing `notification-attachments` Storage bucket and owner policies
  (migration `202607260001`), and fixed `delete_account_data_internal` calling
  `pg_catalog.coalesce` — a keyword, not a function — which made every account
  deletion fail with `INTERNAL_ERROR` (migration `202607260002`). The
  `delete-account` Edge Function was redeployed and verified end to end.

### Removed

- The Zona custom sound presets (`zona-*.wav`) are retired now that the
  iPhone ringtone collection covers the picker: the nine bundled presets,
  their generator script, `app.json` plugin entries, i18n strings, type
  members, and `notify` allow-list entries are gone. The picker offers only
  Default, the 66 iPhone tones, and Silent. Migration
  `202607250003_remove_zona_sound_presets` rewrites any stored preset
  selections to `default` before tightening the check constraint; the app
  shows a "Custom sound" fallback label for stored values it no longer
  offers, and the push path keeps falling back to `default` for unknown
  values.

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
- iPhone ringtone choices in the per-source picker (migration
  `202607250002_ios_alert_tone_sounds`): the full classic iPhone ringtone
  collection (66 tones, from Alarm and Aurora to Waves and Xylophone) now
  appears beside the bundled Zona presets, listed name-only in the style of
  iOS-native sound pickers. iOS gives apps no API to reference the phone's
  system tones, so the tones ship as bundled audio files
  (`assets/sounds/ios-*.wav`) that APNs plays by basename. A pure app-side
  mapping (`notification-sound-map.ts`) resolves each choice for preview,
  push payload, and Android channel, and the `notify` allow-list accepts the
  new identifiers. **Licensing note:** the tone audio originates from Apple
  system-sound collections mirrored for development use; it is acceptable
  for private/preview builds but must be reviewed before any App Store
  release.

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
