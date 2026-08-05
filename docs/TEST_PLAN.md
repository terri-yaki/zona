# Zona test plan

This plan is the release-verification contract for the private TestFlight
version of Zona. It covers the Expo SDK 56 app, Supabase migration and Edge
Functions, sender API, and physical iOS/Android push behavior.

Passing a compiler or finding no known bug is not proof of production
readiness. Every release requires the evidence defined below.

## Test environments

| Environment | Purpose | Data rule |
| --- | --- | --- |
| Local Supabase | Migration, function, database, RLS, and fault tests | Synthetic only |
| Expo web/simulator/Expo Go | Fast UI and unsupported-push degradation | Synthetic only; not push acceptance evidence |
| Preview EAS build | Native navigation, permissions, deep links, and regression | Dedicated non-production Supabase project preferred |
| Production TestFlight build | Final APNs and lifecycle matrix | Dedicated test account and non-sensitive alert content |

Production credentials must never be placed in test fixtures, command output,
screenshots, or CI logs.

## Required automated gates

The repository CI entry point should run from a clean checkout and include:

```sh
cd zona
npm ci
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform ios --output-dir dist
```

Backend gates run in pinned Deno and Supabase CLI environments. CI starts a
disposable local stack, rebuilds it from migrations, then tests and lints the
result:

```sh
deno fmt --config supabase/functions/deno.json --check supabase/functions
deno lint --config supabase/functions/deno.json supabase/functions
deno test --config supabase/functions/deno.json supabase/functions/_shared
supabase start
supabase db reset --local --no-seed
supabase test db
supabase db lint --local --level error --fail-on error
npx --yes @redocly/cli@2.43.2 lint docs/openapi.yaml
node scripts/check-openapi-contract.mjs
```

CI also serves the functions against that disposable stack and runs
`scripts/test-local-edge-contract.mjs`. The live smoke test signs in a fresh
anonymous account, binds its installation, creates a source, verifies a new
`notify` response and idempotent replay, then reads the zero-device delivery
summary. No production secret or production row is used.

The OpenAPI lint plus response-field drift check is the secret-free contract
gate. Full local HTTP behavior tests remain required release evidence. Add
secret scanning and linked migration-drift checks once their credentials and
ownership are configured; generated output and credentials must not be
committed.

## Test layers

### Unit tests

Cover all pure validation, normalization, formatting, source token generation,
error mapping, pagination cursor handling, and push payload construction.
Boundary cases must include Unicode and byte length, not only JavaScript string
length.

### Database tests

Use pgTAP or equivalent isolated SQL tests. Test every policy and service-only
function as anonymous, authenticated user A, authenticated user B, and service
role where applicable.

Required database cases:

- only owner can select sources and unexpired notifications;
- only owner can mark `read_at` and delete a notification;
- changing protected columns through the client is rejected;
- source creation validates owner, lengths, and token hash;
- two duplicate hostnames are accepted as independent UUIDs;
- ingestion derives owner/source, snapshots display name, and rejects revoked
  or unknown tokens;
- a rename affects future snapshots only;
- concurrent rolling-rate checks accept at most 60 per source/minute;
- source A’s lock does not unnecessarily serialize source B;
- attachment metadata can be set only through the service function and only
  for the exact `{owner}/{notification}` path with an allowed MIME/size;
- cleanup deletes expired notifications/delivery rows, old request rows, and
  expired attachment objects but not live data;
- user/account deletion cascades through all owned data;
- every Auth user has exactly one personal account and active owner membership;
- guest identity linking preserves the Auth user ID and existing ownership;
- membership policies reject cross-account reads and user metadata cannot grant
  account, role, plan, or integration scope;
- installation revocation and guest transfer are owner-checked, idempotent, and
  safe under concurrent requests;
- a deleting account immediately rejects RLS access, ingestion, transfers, and
  integration use even when a previously issued access token has not expired;
- inactive, expired, future, platform-mismatched, and lower-priority runtime
  rules are ignored; stable rollout assignment is deterministic;
- presentation controls cannot bypass server ownership, RLS, quotas, or kill
  switches; missing service-switch state fails closed;
- inactive changelog releases and individual release-note items are hidden;
- compatibility views preserve v0.0.5 reads while v0.0.6 owner RPCs and
  user-scoped Realtime Broadcast prevent cross-account access.
- inbox search cannot cross accounts and safely treats wildcard characters as
  text; pinned pagination remains stable when timestamps match;
- saved filters and notification schedules are owner-only, bounded, and reject
  a source belonging to another account;
- quiet hours store the alert first, skip only push-job creation, and report a
  non-failure `quiet_hours` delivery reason across daily and overnight windows;
- source health aggregates only owned sources and never exposes device tokens,
  provider ticket IDs, raw errors, or notification bodies.

### Edge Function contract tests

Run functions against local Supabase and validate the
[OpenAPI contract](openapi.yaml).

For every function, cover OPTIONS, wrong method, content type, malformed JSON,
missing/invalid/expired credential, declared and streaming body oversize, and
unexpected database/provider failures. Test that error responses never expose
stack traces, SQL details, tokens, or notification content.

`notify` additionally requires:

- exact title/body/category/metadata boundaries;
- metadata must be an object and no more than 4 KiB serialized;
- caller-supplied owner/source fields cannot change attribution;
- HTTP 202 is returned only after the durable row exists;
- zero-device behavior and a queue-count response that matches the durable jobs
  created for eligible phones;
- worker Expo timeout, non-JSON response, non-2xx response, partial ticket
  errors, retry exhaustion, and receipt success/permanent/unknown outcomes;
- failed push retains the inbox row and records a bounded diagnostic, while
  `pushAccepted` remains a zero-valued compatibility field on `/notify`;
- HTTP 429 includes `Retry-After`;
- revoked token and token for another source fail without information leakage;
- multipart accepts one PNG/JPEG/WebP image up to 5 MiB and rejects spoofed
  magic bytes, SVG, renamed executables, oversize files, and requests over
  6 MiB with the documented statuses;
- a replay with the identical image returns 200 without re-upload, and the
  same key with a different image returns 409;
- a forced Storage failure still returns 202 with `attachmentAccepted: false`
  and retains the inbox row.
- disabled ingestion returns `503` with `Retry-After`; disabled attachments or
  critical severity return the documented `403` without weakening token checks;
- disabling push still accepts and stores the inbox row with no queued job.

User-authenticated functions require two-user tests for cross-account rename,
revoke, push registration, token conflict, and deletion. Gateway JWT checking is
disabled, so tests must prove each handler validates Supabase Auth itself.
Account functions additionally test recent reauthentication, last-method
unlink rejection, session/installation revocation, callback intent/state,
dual-session transfer proof, transfer preview/limits, and resumable deletion.
The identity suite separately verifies Supabase's minimum-identity behavior and
records that a valid session can call public identity APIs without passing
through Zona's app-level recent-proof gate.

### Mobile component and integration tests

The current automated mobile suite uses Vitest for pure helpers and parsers,
plus focused `react-test-renderer` probes where hook lifecycle behavior matters;
network and native modules are mocked at their boundaries. It does not claim
React Native Testing Library coverage. Keep verifying search matching,
saved-filter parsing, pin/mark-unread helpers, repeated-alert grouping,
schedule validation, diagnostic redaction, first-alert templates, widget prop
selection, foreground refresh, and themed-style rerenders. Fake-timer
regression suites cover hung inbox/sources fetches and cache reads timing out
without stranding the refreshing, loading-more, or bootstrap indicators, and
superseded loads from mid-flight filter changes clearing their indicators. Interaction-heavy
screen behavior remains part of the physical-device matrix until a dedicated
native component harness is added.

Native iOS release checks must generate the WidgetKit target and compile the
App Intents source. On a physical iPhone, exercise every configured widget
family and the **Open Zona Inbox** and **Prepare a Zona Alert** Shortcuts actions.

Additional lifecycle cases:

- anonymous sign-in pending, success, and provider error;
- email (one-time code and password), Apple, Google, and GitHub sign-in and
  guest-protection flows;
- same-UUID guest upgrade preserving sources, keys, preferences, inbox, cache,
  installation registration, and entitlements;
- auth callbacks from cold, warm, background, terminated, duplicate, expired,
  wrong-state, wrong-intent, canceled, denied, and offline states;
- transfer cancellation, expiry, denial, and relaunch retain the active guest
  session and suppress cache/push side effects from isolated destination auth;
- email sign-in uses `shouldCreateUser=false`, explicit sign-up can create, and
  unknown/mistyped addresses remain non-enumerating;
- automatic verified-email identity linking lands on the expected account and
  never triggers an application-data merge;
- linked-method listing/add/remove, recent reauthentication, and blocked removal
  of the last recovery method;
- second-phone restore, remote installation revoke, sign out this phone, sign
  out other phones, and sign out everywhere;
- legacy sessions bind to an installation on their next push registration or
  v0.0.8 launch handshake; an otherwise valid unbound session remains usable
  during compatibility, is absent from selective removal, and is denied as soon
  as the account is tombstoned;
- account switching while push registration is in flight, atomic Expo-token
  ownership transfer, and retry after a prior `TOKEN_CONFLICT`;
- existing-account provider conflict and guest-transfer confirmation without
  any silent merge;
- expired/invalid saved-session restoration;
- push onboarding for granted, denied, simulator, Expo Go, web, missing EAS
  project ID, and provider error;
- source creation, one-time token warning/copy, rename, revoke, and all error
  states;
- one source can create, list, label, pause/resume, and individually revoke
  several keys while a replacement key keeps ingestion active;
- old source overview/API-key screens still show exactly one card per source,
  with legacy pause/revoke/sound actions mapped to aggregate or source settings;
- an integration-owned source with no Zona source key is absent from the legacy
  key view but remains attributable and filterable by its permanent source ID;
- inbox loading, empty, error, refresh, realtime insert/update/delete,
  pagination, source/unread/date filters, and filter count semantics — initial
  and filter loading render skeleton placeholder rows (the
  `inbox.loadingFiltered` accessibility label survives) instead of full-screen
  or filter-row spinners, and the source filter chips keep active sources first
  with revoked sources sunk to the end when the row is capped;
- the notification-detail Delivery card renders nothing until a real summary or
  an error exists, shows a fixed bell.slash icon on the error branch, and stops
  polling a `queued` summary after 120 seconds (restarting on id change or
  manual retry);
- dropped Realtime channels (inbox, runtime bootstrap, Live Status sync)
  resubscribe silently with backoff starting at 5 seconds and capped at one
  attempt per minute, deferred while backgrounded until the next foreground
  transition, and Settings shows a neutral relay state instead of raw error
  text during the outage;
- notification read and delete authorization/errors, including early purge of
  an attached image;
- attachment loading, rendering, and failure states in the detail screen, and
  the inbox attachment badge;
- guest-transfer cancellation, expiry, process death, and injected copy failure
  remove all service-only staged objects; scheduled orphan cleanup leaves no
  destination-readable attachment;
- notification interaction routing with missing, malformed, or unauthorized IDs;
- current-installation registration refresh and safe sign-out;
- deletion continues through its service-side queue after normal sessions are
  denied; only the deletion receipt/initiating deletion-only session can read
  status or request resume before final Auth-user removal;
- offline transitions and recovery without representing errors as an empty inbox.
- cold launch from a fresh on-device cache, stale content followed by background
  refresh, manual refresh, and recovery from corrupt or oversized cache data;
- strict account isolation across sign-out and account switching, including a
  delayed request that completes after the former user's cache is cleared;
- guest sign-out keeps the permanent-loss warning; sign-out/deletion dismisses
  delivered notifications and removes user-specific Android source channels;
- bounded cache retention, size reporting, manual clearing, and the absence of
  any offline write queue;
- one-call inbox snapshot behavior plus the temporary two-read fallback when
  the additive v0.0.7 RPC is not available yet;
- stale-while-revalidate runtime bootstrap caching, fail-safe compiled defaults,
  per-feature hidden/disabled behavior, build update banners, maintenance mode,
  and persisted dismissal of dismissible announcements;
- severity styling returns to the neutral white presentation when its display
  control is disabled or hidden.

Timers and subscriptions must be cleaned up after navigation/unmount.

### End-to-end API and multi-source tests

Create user A with source A1 and A2 and user B with source B1. Never log the
generated tokens. Automate the following sequence:

1. A1 and A2 concurrently send distinguishable events.
2. A’s inbox contains both events with correct stable source UUIDs/names.
3. B cannot read either event and B1 cannot attribute to A1/A2.
4. Rename A1, send again, and confirm old/new snapshots.
5. Give A1 and A2 the same hostname and confirm independent operation.
6. Revoke A1; A1 fails immediately while A2 continues.
7. Force push-provider failure and confirm durable inbox synchronization.
8. Create more than 200 retained notifications and page through all of them
   with source, unread, and date filters.
9. Advance controlled database time and verify cleanup behavior.

The suite must delete its synthetic Auth users and data after completion.

## Physical iOS and Android matrix

Run on at least one currently supported physical iPhone/iOS version and one
physical Android device with configured FCM credentials. Before external
reliance, also exercise the oldest supported OS versions. Record device model,
OS, build ID, EAS build URL, account, time, and evidence link.

| Scenario | Expected result |
| --- | --- |
| Fresh install, permission accepted | Token registers and test push displays correct source |
| Fresh install, permission denied | Inbox remains usable; settings explain status |
| Foreground alert | In-app notification behavior is intentional and no duplicate navigation occurs |
| Background alert | Banner/list shows title, body, and source; tap opens correct detail |
| Terminated app alert | Tap cold-starts into authorized detail after session restoration |
| Token refresh/reinstall | Current registration updates without cross-account conflict |
| Sign out | Current installation stops receiving account alerts |
| Rename source | Future push uses new name; old inbox row keeps old name |
| Revoke one of two sources | Only revoked source fails |
| Expo service failure simulation | Inbox row still appears after refresh |
| Realtime drop and reconnect | Severing connectivity drops inbox updates temporarily; the channel resubscribes silently and the inbox refreshes without manual pull-to-refresh, and reopening a backgrounded app recovers without a stuck relay error in Settings |
| Enabled email/provider recovery | Callback returns to the app and restores intended routing |
| Password sign-in | User signs in with email and password on a second phone and recovers sources and recent inbox |
| Guest protection by password | A guest adds email + password, verifies the 6-digit code, and keeps existing sources and history |
| Cross-device restore with password | Same password signs into the same account from a fresh install and receives the correct owner-scoped data |
| Wrong-password error | Invalid password returns a non-enumerating error with no account or existence hint |
| Unconfirmed-email pending state | After sign-up or email change, the app routes to pending confirmation and blocks protected actions until the code is verified |
| Signup-code resend | Resend stays within the provider cooldown and delivers a fresh usable code |
| Seven-day boundary | Expired item disappears and current item remains |
| VoiceOver and large text | Primary flows remain understandable and operable |
| Lock-screen preview settings | Content exposure matches documented user expectations |

Expo Go results do not satisfy any remote-push row.

## Security and abuse tests

- replaying a valid notification request with the same key/content returns the
  original row; a changed payload conflicts and cannot cross source scope;
- brute-force invalid source credentials do not leak existence or timing details;
- rate limiting remains correct under parallel requests;
- CORS and method handling expose no extra method or credential;
- notification metadata cannot override reserved push routing fields;
- logs and delivery response storage are bounded and contain no credential;
- compromised-source replacement and revocation complete without impacting
  other sources;
- rotated Supabase secret/publishable keys invalidate old privileged access and
  do not break the signed mobile build unexpectedly;
- dependency, secret, and static analysis findings are reviewed before release.

Future PC commands require an independent security test plan and are not
authorized by this notification plan.

## Reliability and observability tests

- assert structured request IDs are present from Edge Function entry through
  stored push diagnostics;
- trigger each production alert once in a non-user-impacting test environment;
- verify the synthetic canary detects API, database, Expo, and inbox failures;
- verify cron-staleness alerting and delivery-failure dashboards;
- run a Supabase backup/restore drill and record achieved RPO/RTO;
- rehearse rollback for app binary, Edge Functions, and forward database repair.

## Release evidence record

Copy this table into the release ticket. Blank evidence is a failed gate.

| Gate | Result | Date/time UTC | Artifact/commit/build | Owner |
| --- | --- | --- | --- | --- |
| Clean checkout + dependency install |  |  |  |  |
| Typecheck/lint/unit tests |  |  |  |  |
| Deno/database/RLS/contract tests |  |  |  |  |
| Expo Doctor + SDK 56 dependency check |  |  |  |  |
| Dependency/security/secret scan |  |  |  |  |
| iOS production export/build |  |  |  |  |
| Multi-source E2E |  |  |  |  |
| TestFlight physical-device matrix |  |  |  |  |
| Privacy/account-deletion verification |  |  |  |  |
| Migration/function deployment parity |  |  |  |  |
| Monitoring and rollback rehearsal |  |  |  |  |

## v0.0.10 Control Room matrix

- Compare the 69 compiled runtime feature keys with `private.app_control_catalog` and
  assert that every key has one safe global baseline without duplicating the
  existing v0.0.6 rows.
- Exercise `enabled`, `disabled`, `hidden`, and `read_only` on one control in
  every app area. A hidden filter must stop affecting its query immediately.
- Verify priority, platform, channel, locale, tier, build, schedule, and rollout
  targeting still select exactly one evaluated rule.
- Enter values below and above every numeric catalog bound. Database metadata
  must explain the supported range and the client must clamp unsafe values.
- Confirm `anon` and `authenticated` cannot read the private catalog or
  dashboard, while bootstrap returns only the evaluated app-safe snapshot.
- Search sources by display name, hostname, key label, and key prefix; confirm
  case-insensitive matching, blank-query behavior, duplicate hostnames, and a
  useful no-results state.
- Copy and share an alert with and without category/severity. The result must
  contain useful title/body/source/time text and exclude metadata, credentials,
  database IDs, and attachment URLs.
- Check App Status for fresh, saved/stale, limited, maintenance, offline, and
  refresh states. Only validated HTTPS support links may open.
- At 320, 375, and 430 point widths, and with the largest supported text size,
  verify source actions wrap cleanly, settings never show orphan dividers,
  labels remain legible, and every primary/icon control has a 44-point target.
- Run the same matrix in English and Traditional Chinese on iOS and Android.

## Exit criteria

- Every PRD acceptance row is linked to current evidence.
- No severity-critical/high security finding is open. Moderate findings require
  an owner, mitigation, expiry, and approval.
- No known crash, data-isolation defect, accepted-alert loss, or account-deletion
  defect is open.
- All external identifiers, credentials, URLs, privacy metadata, and
  owners are complete.
- Release owner signs [RELEASE.md](RELEASE.md).

