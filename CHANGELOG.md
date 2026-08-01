# Changelog

All notable changes to Zona are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure and intends
to use semantic application versions. Build numbers are managed by EAS.

## [Unreleased]

## [0.0.8] - 2026-07-30

### Added

- Protect your Zona with email, Apple, Google, or GitHub, then pick up your
  sources and recent inbox on another phone.
- Give scripts and agents their own labelled access keys, replace one safely,
  and keep the same source name, sound, filters, and history.
- See and remove phones that should no longer have access to your Zona.
- Pick a color theme that suits you — Meadow, Ocean, Sunset, or Violet —
  from Settings.
- Sensitive account changes, like unlinking a sign-in method or moving your
  Zona to another phone, now ask for a recent sign-in proof before they go
  through.

### Changed

- Opening Zona or coming back to it always checks the server for new alerts
  and sources; saved copies still paint first while the refresh lands.
- What's New now always asks the server for the latest content instead of
  trusting a fresh-enough saved copy.
- Push delivery runs through a durable queue, so a temporary hiccup retries
  instead of dropping the alert.

## [0.0.7] - 2026-07-29

### Added

- Open Zona and your recent alerts are already waiting, with less time spent on
  loading screens.
- Recent alerts remain available when the connection drops, then Zona quietly
  catches up when you are back online.
- Saved inboxes stay separate for each account and leave the phone when that
  account signs out.
- Settings shows how much space Zona is using and lets you clear saved content
  whenever you choose.

- Runtime feature controls with `enabled`, `disabled`, `hidden`, and
  `read_only` modes; activation windows; iOS/Android/web, channel, locale,
  tier, and build targeting; deterministic percentage rollout; localized
  reasons; and explicit priorities. The app caches one evaluated bootstrap
  snapshot and revalidates in the background.
- Typed runtime settings, standard/premium plan limits, server kill switches,
  release/update policies, and localized in-app announcements. Trusted server
  paths enforce source creation, ingestion, testing, attachments, critical
  severity, push delivery, rate limits, retention, and device caps rather than
  relying on hidden client controls.
- Normalized `app_release_notes` and `app_release_note_items`. Every What's New
  card has its own `is_active`, order, schedule, and optional platform target;
  RLS hides inactive content and an authoritative empty result stays empty.
- Server-owned `private.account_entitlements`, separated from user-writable
  notification preferences. Purchase integration remains future work.
- User-scoped Realtime Broadcast invalidations for inbox and Live Activity,
  decoupling v0.0.6 from physical table names.
- Global and account-scoped runtime-control invalidations, so active apps pick
  up operator changes promptly while a bounded poll covers missed broadcasts.
- `docs/RUNTIME_CONTROLS.md`, including the complete control catalog, safe
  operator examples, precedence, caching, and staged rename procedure.

### Changed

- v0.0.6 uses canonical relation names such as `notification_sources`,
  `source_access_keys`, `notification_source_overview`, `inbox_notifications`,
  `push_registrations`, and `user_notification_preferences`. Compatibility
  views and owner-checked RPCs keep v0.0.5 working until the physical rename
  cutover after adoption.
- Settings now receives guide URL and tier-resolved retention through the
  cached bootstrap instead of a focus-time config query. Preference creation
  and read are one RPC instead of an upsert/select waterfall.
- The `notifications_attachment_check` constraint no longer hard-caps
  attachment bytes at 5 MiB; the tiered upper bound is enforced by
  `attach_notification_image_internal` against the configured limit.

- Optional notification severity for v0.0.5: send `low`, `medium`, `high`, or
  `critical` through the JSON or multipart API. Inbox cards use candy green,
  yellow, orange, or red backgrounds, Android notification icons receive the
  matching accent color, and omitted severity stays clean white.
- Server-driven What's New began with `public.app_changelog` and is now
  normalized into release and item tables. The screen fetches it on open, so
  content can be updated without shipping an app build, and uses bundled copy
  only when the backend is unreachable—not when the operator publishes an
  intentionally empty result.
- Preview builds now auto-increment the remote iOS build number
  (`eas.json` `preview.autoIncrement`), matching the production profile.
- Settings → "Delete account and data" now requires two consecutive explicit
  confirmations before any delete request fires: the first dialog explains
  the permanent deletion, the second is the final confirmation, and canceling
  either aborts the flow. The gating logic is a pure, unit-tested state
  machine (`delete-confirmation.ts`); the destructive call is only reachable
  from the doubly-confirmed state.

### Fixed

- Corrected the legacy premium-field guard's invalid
  `pg_catalog.current_user` reference. `current_user` is SQL syntax, and the
  qualified form caused preference creation/update to fail with `42P01`; the
  forward repair migration restores the owner preference RPCs.
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
- `npm run check:sdk56` and `npm run release:check` release-gate scripts.
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
- Resolve or approve a time-bounded mitigation for outstanding SDK-56
  dependency advisories without forcing an unplanned SDK upgrade.

## [0.0.4] - 2026-07-26

### Added

- Zona now supports Android! Android builds can register with Expo through
  FCM, receive source-aware notifications, and keep each source on its own
  native notification channel.

### Changed

- Android screens, sheets, keyboard behavior, system bars, bottom tabs, and
  shared icons now follow Android safe areas and Material conventions.
- Per-source sound controls are platform-native: Android opens that source's
  notification-channel settings, while iOS keeps the bundled ringtone picker.

### Fixed

- Missing Android push configuration now produces a useful setup message
  instead of exposing a raw native initialization error.

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
