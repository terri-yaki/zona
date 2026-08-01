# Zona product requirements

Status: Draft; release gates in this document are not yet satisfied.  
Product scope: private iOS TestFlight and Android preview distribution.
Native baseline: Expo SDK 56.

## Product statement

Zona is a private, multi-source alert inbox. A signed-in user creates an
independent source for each trusted PC or local application. That sender uses
the one-time source credential to submit an alert to a Supabase Edge Function.
Zona stores the alert in a retention-bounded inbox and then attempts one
best-effort Expo/APNs-or-FCM push to each registered installation.

The database record is the source of truth. A successful API response means
the inbox item was accepted; it does not guarantee that iOS displayed a push.

## Product decision and scope change

The original concept included a separately installed .NET Windows companion,
QR/manual pairing codes, Windows Credential Manager integration, and a
loopback-only local API. That design has been retired for version 1. Local
applications now call the hosted notification API directly with a per-source
credential. See [ADR 0001](adr/0001-source-token-architecture.md).

Consequences of the decision:

- There is no .NET deliverable, tray application, local HTTP listener, QR
  pairing flow, pairing-code expiry, or companion heartbeat in version 1.
- A source represents one PC or application, but Zona does not prove that a
  given token is stored on a particular physical computer.
- Secure storage and sender retry behavior are the sender operator's
  responsibility. On Windows, Windows Credential Manager or another OS-backed
  secret store is recommended.
- Sender-supplied source identity is never trusted. The server derives it from
  the credential hash.

Any return to pairing codes or a managed companion requires a new ADR and
updated acceptance tests.

## Users and primary jobs

The initial user is a technically capable owner operating one private account,
one or more mobile installations, and multiple trusted PCs or local applications.

The user must be able to:

1. Start using the app without email or password through Supabase anonymous
   sign-in.
2. understand and choose whether to enable iOS push notifications.
3. create a named source and capture its secret exactly once.
4. send alerts from multiple sources without allowing one source to impersonate
   another.
5. see the originating source in the inbox, detail screen, and iOS push.
6. filter inbox items by source, unread state, and date.
7. rename or independently revoke a source while retaining historical labels.
8. mark alerts read, delete individual alerts, and synchronize accepted alerts.
9. manage the current phone's push registration, sign out, and delete the
   account and associated data.

## Functional requirements

### Authentication and account lifecycle

- **AUTH-01** The shipped guest path uses Supabase Auth anonymous sign-in and
  collects no email or password. Signing out an unprotected guest is permanent
  and must be confirmed in the UI. Protected v0.0.8 accounts may collect the
  minimum verified identity data described by AUTH-05–AUTH-12 and ADR 0004.
- **AUTH-02** Expired, malformed, or cross-account sessions must fail closed.
- **AUTH-03** Signing out must stop delivery to that installation or clearly
  report when deregistration could not be completed.
- **AUTH-04** Before external TestFlight or App Store distribution, the app
  must offer an easy-to-find, confirmed account-deletion flow that deletes the
  Supabase Auth account and application data that is not legally retained.
- **AUTH-05** v0.0.8 must retain private guest start and let a guest protect the
  same account with email, Apple, Google, or GitHub without changing its Auth
  user ID or existing ownership.
- **AUTH-06** A protected user can restore server-held sources, preferences,
  entitlements, and retained history on another phone. Plaintext source keys
  remain non-recoverable.
- **AUTH-07** Users can list and link sign-in methods, but cannot unlink their
  final verified recovery method.
- **AUTH-08** Provider identity conflicts must stop for an explicit account
  choice; email equality must never silently merge accounts.
- **AUTH-09** Zona-controlled installation, transfer, export, and deletion
  actions require server-verified recent reauthentication and a redacted audit
  event. Identity-linking UI applies the same proof policy as defense in depth;
  Supabase's public identity APIs remain the underlying enforcement boundary.
- **AUTH-10** Human sessions, account ownership, app installations, source
  credentials, and future integration credentials are separate principals.
- **AUTH-11** Users can inspect and revoke app installations and sign out this
  phone, other phones, or every phone with clear push/cache cleanup semantics.
- **AUTH-12** The additive account foundation must keep v0.0.5–v0.0.7 personal
  account flows operational during the compatibility window. See
  [ACCOUNT_MANAGEMENT.md](ACCOUNT_MANAGEMENT.md) and ADR 0004.

### Source lifecycle

- **SRC-01** Each source has a permanent UUID, owner UUID, display name,
  optional hostname, creation time, last activity time, and revocation time.
- **SRC-02** A newly created source receives an opaque credential exactly once;
  only its cryptographic hash is retained server-side.
- **SRC-03** Credentials are independent and immediately revocable.
- **SRC-04** Renaming a source must not change its UUID or rewrite historical
  source-name snapshots.
- **SRC-05** Duplicate hostnames and display names are allowed.
- **SRC-06** The UI must not describe a source as currently online unless an
  explicit heartbeat protocol exists. Alert activity is not presence.
- **SRC-07** Shipped builds before v0.0.8 cannot rotate a credential in place;
  their recovery flow is create replacement, update sender, verify, then revoke
  the old source.
- **SRC-08** v0.0.8 adds independently revocable overlapping keys to one
  permanent source so rotation preserves source identity, history, and sound.

### Notification ingestion and inbox

- **NOTI-01** `title` and `body` are required; category, object metadata, and
  severity (`low`, `medium`, `high`, or `critical`) are optional and validated
  according to the OpenAPI contract.
- **NOTI-02** Acceptance must atomically rate-limit the authenticated source,
  update its last activity, snapshot its display name, and insert the inbox
  record before any external push attempt.
- **NOTI-03** A caller cannot select `userId`, `sourceId`, or source name.
- **NOTI-04** The API returns the accepted notification UUID and authenticated
  source UUID with HTTP 202.
- **NOTI-05** Push is enqueued into a durable job table after inbox acceptance.
  The delivery worker retries transient Expo failures with backoff and polls
  receipts; permanent provider errors disable stale registrations. Failure must
  not remove or hide the accepted inbox item.
- **NOTI-06** The inbox supports cursor pagination and queries by source,
  unread state, and date. A UI cap must not make retained records unreachable.
- **NOTI-07** Notification detail navigation must work from foreground,
  background, and terminated-app push interactions.
- **NOTI-08** Notifications expire after the server-resolved plan retention
  window (seven days for the standard plan). Cleanup health must be monitored.
- **NOTI-09** A notification may carry one evidence image (PNG/JPEG/WebP, at
  most the server-resolved plan limit—5 MiB standard—and verified by magic
  bytes). The image is stored in a private
  bucket readable only by its owner, participates in idempotency, is
  best-effort like push, and shares the seven-day retention.
- **NOTI-10** Severity participates in idempotency and changes presentation,
  not delivery priority. Null severity uses a neutral white inbox card.
- **NOTI-11** Notification detail shows an owner-scoped delivery summary. It
  distinguishes no targeted phone, queued work, provider acceptance, and
  terminal failure without exposing private delivery internals or claiming
  that a provider receipt proves the phone displayed the alert.

### Mobile push registration

- **PUSH-01** Permission is requested only after explanatory onboarding and is
  not required to use the synchronized inbox.
- **PUSH-02** Each physical iOS or Android installation has a stable installation ID
  and an Expo push token associated with the authenticated owner.
- **PUSH-03** Token refreshes must update the registration; cross-account token
  conflicts must fail closed.
- **PUSH-04** Expo Go, web, and simulator states must degrade without invoking
  unavailable native notification APIs.
- **PUSH-05** Per-account options control whether push is attempted, whether it
  plays sound, and whether lock-screen content contains the alert preview.
  Disabling push never prevents the durable inbox record.
- **PUSH-06** Every active source can select an iOS bundled ringtone or use its
  native Android notification channel independently. The global sound switch
  overrides per-source choices.

### Source API

- **API-01** Sender traffic uses TLS and a Bearer source credential only in the
  `Authorization` header.
- **API-02** The public contract is documented in
  [openapi.yaml](openapi.yaml) and [API.md](API.md).
- **API-03** The server enforces a 16 KiB request cap, field limits, 4 KiB
  metadata cap, and 60 accepted requests per rolling minute per source.
- **API-04** Clients retry only network failures, HTTP 5xx, and HTTP 429 with
  bounded exponential backoff and reuse the same required idempotency key.
- **API-05** The owner can pause and resume an API key independently. The safe
  key registry exposes name, prefix, active state, usage, expiry, and revocation
  timestamps but never the raw credential or credential hash.

## Non-functional requirements

- **NFR-01 Isolation:** a user and source can access only their own records.
  Row-level security and Edge Function authorization require automated
  cross-tenant tests.
- **NFR-02 Durability:** an HTTP 202 response is returned only after durable
  inbox insertion.
- **NFR-03 Security:** secret/service-role keys never enter the Expo bundle,
  sender configuration, logs, or notification metadata.
- **NFR-04 Privacy:** the product documents all data sent through Supabase,
  Expo, APNs, and FCM; notification content may appear on a lock screen.
- **NFR-05 Accessibility:** primary flows support VoiceOver labels, Dynamic
  Type, sufficient contrast, and non-color-only state indicators.
- **NFR-06 Operability:** production has structured logs, correlation IDs,
  dashboards, alerts, a synthetic check, and an owned runbook.
- **NFR-07 Compatibility:** version 1 remains on Expo SDK 56 until an explicit,
  tested upgrade decision. Expo Doctor and dependency compatibility checks are
  release gates.
- **NFR-08 Performance:** the inbox must remain navigable throughout its
  retention window under the documented rate limit; cursor pagination is
  required.

Initial service objectives must be approved before production use:

| Measure | Proposed objective |
| --- | --- |
| Notification API availability | 99.9% monthly, excluding declared provider incidents |
| Accepted-request p95 latency | Under 1 second before external push work |
| Inbox synchronization | Accepted item visible after refresh within 10 seconds |
| Cleanup freshness | No expired notification remains more than 2 hours |
| Incident acknowledgment | Within 30 minutes for a private-production alert |

## Data and retention

| Data | Planned retention |
| --- | --- |
| Notification content and delivery logs | Seven days, then automated deletion |
| Rate-limit request rows | One day |
| Active source identity and credential hash | Until source/account deletion |
| Revoked source identity and credential hash | Until account deletion or an approved archival purge |
| Push registration | Until installation deregistration or account deletion |
| Authentication account | Until account deletion, subject to provider/legal requirements |

The operator must publish the final policy in [PRIVACY.md](../PRIVACY.md) and
configure App Store privacy answers consistently.

## Acceptance matrix

Every row needs an artifact link or recorded result before release. “Code
exists” is not sufficient evidence.

| ID | Acceptance scenario | Required evidence |
| --- | --- | --- |
| AC-01 | Two independently authenticated sources send concurrently to one account | Automated integration test and inbox capture |
| AC-02 | Every push, inbox row, and detail view identifies the correct source | Integration assertions and TestFlight screenshots |
| AC-03 | Rename changes future labels but preserves old snapshots | Database/inbox E2E test |
| AC-04 | Duplicate hostnames remain independent | Integration test |
| AC-05 | Revoking source A immediately rejects A but not source B | Parallel authorization test |
| AC-06 | Source cannot impersonate another source or owner | Negative API and database test |
| AC-07 | Cross-user reads, updates, deletes, and management fail | RLS/Edge Function tests using two users |
| AC-08 | Forced Expo failure still leaves the accepted inbox row | Fault-injection test |
| AC-09 | Source, unread, date, and pagination filters return complete results | Query/UI tests beyond 200 records |
| AC-10 | Foreground, background, and terminated notification interactions open the correct detail | Physical-iPhone TestFlight matrix |
| AC-11 | Expired sessions and malformed credentials fail closed | Automated endpoint tests |
| AC-12 | Boundary, malformed, oversized, and non-object metadata payloads are rejected | Contract tests |
| AC-13 | Concurrent request 61 in a rolling minute is rate-limited | Database concurrency test |
| AC-14 | Seven-day cleanup and one-day rate-log cleanup run and are monitored | Time-controlled DB test and cron alert evidence |
| AC-15 | Expo Go, web, simulator, denied permission, and changed-token paths do not crash | Platform/component tests |
| AC-16 | Account deletion removes the Auth account and owned data | TestFlight and database verification |
| AC-17 | Anonymous sign-in succeeds on a fresh install and restores the same account across restarts | Device smoke test |
| AC-18 | A multipart send stores a magic-byte-verified image readable only by its owner; spoofed, oversized, and replay-with-different-image sends behave per contract | Contract and two-user tests |
| AC-19 | Accessibility checks pass on sign-in, onboarding, inbox, source creation, and settings | VoiceOver/Dynamic Type checklist |
| AC-20 | Email, Apple, Google, and GitHub protect a guest without changing its Auth user ID or owned data | Provider E2E and database parity evidence |
| AC-21 | A protected account restores its server-held data and push registration on another phone | iPhone/Android restore matrix |
| AC-22 | Zona's linking and unlinking flow requires recent proof and cannot remove the last recovery method; tests also document the residual direct-Supabase identity-API boundary | Auth integration tests |
| AC-23 | A provider identity already owned elsewhere stops for explicit conflict handling and never silently merges | Two-account provider test |
| AC-24 | Revoking one or all installations stops their sensitive access and future push without affecting active allowed phones | Session/push E2E evidence |
| AC-25 | Guest transfer and account deletion are idempotent, resumable, cross-account isolated, and fail closed | Database/Storage/Auth fault-injection evidence |

Pairing-code expiry/reuse tests are intentionally retired by ADR 0001.

## External release blockers

The following cannot be represented as complete by source code alone:

- Configure EAS production variables for the public Supabase URL/key.
- Configure authentication providers (anonymous sign-ins enabled), APNs
  credentials, and App Store Connect application ownership.
- Publish a privacy-policy URL and support/contact URL.
- Complete App Store privacy answers and implement account deletion.
- Provide final app icon, splash, screenshots, description, reviewer access,
  age rating, and export-compliance answers.
- Produce a signed build and complete the physical-device TestFlight matrix.
- Assign named service, security, privacy, and incident owners.

## Definition of done

Version 1 is releasable only when:

1. every requirement and acceptance row has current evidence;
2. CI and production dependency/security gates pass or have an approved,
   time-bounded risk exception;
3. database migrations and deployed Edge Function source match the release;
4. privacy, account deletion, support, and Apple metadata are complete;
5. a clean production EAS build passes the TestFlight test plan; and
6. the release owner signs the checklist in [RELEASE.md](RELEASE.md).
