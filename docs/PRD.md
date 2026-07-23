# Zona product requirements

Status: Draft; release gates in this document are not yet satisfied.  
Product scope: private TestFlight distribution for iPhone.  
Native baseline: Expo SDK 54.

## Product statement

Zona is a private, multi-source alert inbox. A signed-in user creates an
independent source for each trusted PC or local application. That sender uses
the one-time source credential to submit an alert to a Supabase Edge Function.
Zona stores the alert in a seven-day inbox and then attempts one best-effort
Expo/APNs push to each registered iPhone installation.

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
one iPhone, and multiple trusted PCs or local applications.

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
9. manage the current iPhone push registration, sign out, and delete the
   account and associated data.

## Functional requirements

### Authentication and account lifecycle

- **AUTH-01** Authentication must use Supabase Auth anonymous sign-in; no email
  or password is collected (see ADR 0002). Signing out an anonymous account is
  permanent and must be confirmed in the UI.
- **AUTH-02** Expired, malformed, or cross-account sessions must fail closed.
- **AUTH-03** Signing out must stop delivery to that installation or clearly
  report when deregistration could not be completed.
- **AUTH-04** Before external TestFlight or App Store distribution, the app
  must offer an easy-to-find, confirmed account-deletion flow that deletes the
  Supabase Auth account and application data that is not legally retained.

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
- **SRC-07** A source cannot rotate its credential in place in version 1. The
  supported recovery flow is create replacement, update sender, verify, then
  revoke the old source.

### Notification ingestion and inbox

- **NOTI-01** `title` and `body` are required; category and object metadata are
  optional and validated according to the OpenAPI contract.
- **NOTI-02** Acceptance must atomically rate-limit the authenticated source,
  update its last activity, snapshot its display name, and insert the inbox
  record before any external push attempt.
- **NOTI-03** A caller cannot select `userId`, `sourceId`, or source name.
- **NOTI-04** The API returns the accepted notification UUID and authenticated
  source UUID with HTTP 202.
- **NOTI-05** Push is attempted once without retry processing in version 1.
  Failure must not remove or hide the accepted inbox item.
- **NOTI-06** The inbox supports cursor pagination and queries by source,
  unread state, and date. A UI cap must not make retained records unreachable.
- **NOTI-07** Notification detail navigation must work from foreground,
  background, and terminated-app push interactions.
- **NOTI-08** Notifications expire after seven days. Cleanup health must be
  monitored.
- **NOTI-09** A notification may carry one evidence image (PNG/JPEG/WebP, at
  most 5 MiB, verified by magic bytes). The image is stored in a private
  bucket readable only by its owner, participates in idempotency, is
  best-effort like push, and shares the seven-day retention.

### iPhone push registration

- **PUSH-01** Permission is requested only after explanatory onboarding and is
  not required to use the synchronized inbox.
- **PUSH-02** Each physical iPhone installation has a stable installation ID
  and an Expo push token associated with the authenticated owner.
- **PUSH-03** Token refreshes must update the registration; cross-account token
  conflicts must fail closed.
- **PUSH-04** Expo Go, web, and simulator states must degrade without invoking
  unavailable native notification APIs.

### Source API

- **API-01** Sender traffic uses TLS and a Bearer source credential only in the
  `Authorization` header.
- **API-02** The public contract is documented in
  [openapi.yaml](openapi.yaml) and [API.md](API.md).
- **API-03** The server enforces a 16 KiB request cap, field limits, 4 KiB
  metadata cap, and 60 accepted requests per rolling minute per source.
- **API-04** Clients retry only network failures, HTTP 5xx, and HTTP 429 with
  bounded exponential backoff. Version 1 is not idempotent; senders should put
  their event ID in metadata when duplicate reconciliation matters.

## Non-functional requirements

- **NFR-01 Isolation:** a user and source can access only their own records.
  Row-level security and Edge Function authorization require automated
  cross-tenant tests.
- **NFR-02 Durability:** an HTTP 202 response is returned only after durable
  inbox insertion.
- **NFR-03 Security:** secret/service-role keys never enter the Expo bundle,
  sender configuration, logs, or notification metadata.
- **NFR-04 Privacy:** the product documents all data sent through Supabase,
  Expo, and APNs; notification content may appear on a lock screen.
- **NFR-05 Accessibility:** primary flows support VoiceOver labels, Dynamic
  Type, sufficient contrast, and non-color-only state indicators.
- **NFR-06 Operability:** production has structured logs, correlation IDs,
  dashboards, alerts, a synthetic check, and an owned runbook.
- **NFR-07 Compatibility:** version 1 remains on Expo SDK 54 until an explicit,
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
| AC-18 | Accessibility checks pass on sign-in, onboarding, inbox, source creation, and settings | VoiceOver/Dynamic Type checklist |

Pairing-code expiry/reuse tests are intentionally retired by ADR 0001.

## External release blockers

The following cannot be represented as complete by source code alone:

- Replace `com.example.zona` with an owned Apple bundle identifier.
- Replace `REPLACE_WITH_EAS_PROJECT_ID` with the linked EAS project UUID.
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
