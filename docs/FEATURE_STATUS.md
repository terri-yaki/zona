# Zona feature status

Development mobile version: **0.0.11** on Expo SDK 56. The latest completed
release record in this repository is **0.0.10**.

This is the reconciliation layer between product wording and shipped behavior.
“Implemented” means the code and schema exist. It does not imply that a remotely
controlled feature is enabled for every account, that an external provider is
configured, or that Apple/Google has approved a store release.

## Available in the current app

| Area | Actual behavior | Important limit |
| --- | --- | --- |
| Accounts | A user can start as a private guest. Recovery by email, Apple, Google, or GitHub appears only when that method is enabled in the connected Supabase project. | Provider code existing in the app is not proof that the provider is configured. Plaintext source keys cannot be recovered. |
| Sources and keys | Sources have stable identities, names, optional hostnames, per-source sounds, and independently revocable access keys. A new plaintext key is shown once. | Source activity comes from accepted alerts; Zona has no PC heartbeat and does not prove a computer is online. |
| Notification API | A source token submits JSON or one optional image. The database accepts the inbox record first, then a durable worker sends eligible pushes, retries transient failures, and checks receipts. | HTTP `202` proves inbox acceptance, not that a banner appeared or a person saw it. |
| Inbox | Seven-day standard retention, cursor pagination, source/unread/time/severity/pinned filters, text search, saved views, repeated-alert grouping, pinning, mark-unread, deletion, and offline read cache. | Offline mode never queues writes. Search and filters cover the retained server inbox, not deleted or expired history. |
| Delivery visibility | The owner-scoped backend summary remains implemented. Notification details and Settings display it on app version 0.0.10 or later; older clients never render those two customer-facing surfaces. | The build-version floor applies regardless of runtime controls. Provider acceptance is never device-display or human-read confirmation. |
| Quiet schedules | Account quiet hours and per-source schedules suppress eligible pushes after the inbox record is stored. | Quiet hours do not reject or delete alerts. |
| Source health | The Sources screen shows recent accepted-alert activity, 24-hour volume, and aggregate recent provider delivery success. | This is activity and delivery history, not live presence monitoring. |
| Push | iOS and Android installations register Expo push tokens. Sound, preview, push enablement, and source-specific sound choices are server-backed preferences. | Remote push needs a physical development/preview/store build. Expo Go and web do not provide the full remote-push path. Android also needs FCM transport credentials. |
| Severity | Optional `low`, `medium`, `high`, and `critical` values change the notification/inbox presentation. | Severity is presentation metadata, not delivery priority. Omitted severity stays neutral. |
| Attachments | One private PNG, JPEG, or WebP image may be attached and viewed through an owner-scoped signed URL. | Standard default is 5 MiB. Storage is best effort after inbox acceptance. |
| Account usage | Account shows source, key, phone, retained-alert, recent-volume, attachment-count, and attachment-byte usage. | Counters are account-scoped and do not expose another user's data. |
| App Status | Shows configuration freshness, feature availability, plan capacity, version/build/platform, support link, and a redacted diagnostic summary. | It reports the evaluated client snapshot; it is not an admin console and cannot grant permissions. |
| Themes | Meadow, Ocean, Sunset, Violet, Minimalist, and Neon recolor the app, system chrome, neutral alert cards, and iOS Live Status; the choice is stored on the device. | Theme choice is presentation only and does not change explicit severity colors or authorization. |
| What's New | The app reads active, scheduled release rows and cards from Supabase, with a bundled fallback only when the backend cannot be read. | An intentionally empty server result stays empty. v0.0.9 and v0.0.10 database notes are currently drafts until explicitly activated. |
| Updates | Release binaries use Expo Updates with app-version runtime matching. They check their channel on load, and Settings can manually fetch/restart into a compatible update. | Native dependencies, plugins, sounds, widgets, and a new app version require a new binary. Publishing an OTA is a separate release decision. |
| iOS extras | Live Status, an unread inbox widget, and Shortcuts actions are built for iOS. The widget runtime control governs whether the app writes new snapshots. | Live Status is app-driven and cannot keep refreshing after iOS terminates the app. Shortcuts are compiled into the signed binary and cannot be added, removed, or disabled by runtime configuration. |
| Android UI | Safe-area/navigation-bar handling, Android notification channels, and Android-specific sound behavior are implemented. | Android push still depends on the project FCM setup described in `ANDROID_PUSH.md`. |

## Conditional controls

Runtime controls may hide, disable, or make supported presentation features
read-only for a targeted build, platform, locale, tier, account, or rollout.
They do not bypass RLS, ownership, authentication, quotas, source credentials,
account deletion, sign-out, or revocation. A feature listed above can therefore
be implemented but unavailable in a particular evaluated snapshot.

Service switches separately govern trusted backend actions such as ingestion,
source creation, attachments, critical severity, push delivery, and test alerts.
When a required switch cannot be read, trusted paths fail closed.

## Not implemented

- Arbitrary PC control, remote shell, command execution, and a Windows tray
  companion are not part of Zona.
- Zona does not retry attachment uploads after an accepted notification.
- Zona does not prove a push was displayed or read by a person.
- Live Activity remote ActivityKit push updates are not implemented.
- Store purchases, Zona Plus entitlements from Apple/Google, passkeys, MFA, and
  protected-account merge remain future work.

## Authoritative paths

| Question | Check |
| --- | --- |
| What can the app render or invoke? | `zona/app/`, `zona/src/`, and mobile tests |
| What does the sender API accept/return? | `docs/openapi.yaml`, `supabase/functions/notify/`, and contract tests |
| What can a user read or change? | Applied migrations, RLS/grants, RPC tests, and authenticated Edge Functions |
| What is remotely enabled for one account/build? | The evaluated result of `get_app_bootstrap()` |
| What appears in What's New? | Active rows in `app_release_notes` and `app_release_note_items` |
| What was present at an older boundary? | `versions/vX.Y.Z/` archives |
