# Zona threat model

Scope: the Expo SDK 56 iOS/Android app, Supabase Auth/Postgres/Realtime/Edge
Functions, source integrations, Expo Push Service, and Apple APNs. Version 1 is
notification-only and privately distributed through TestFlight.

This is an engineering threat model, not a compliance certification. Review it
whenever authentication, credential lifecycle, data retention, push transport,
or future PC-control scope changes.

## Security objectives

1. A source can create notifications only for its own owner and identity.
2. A user can read or mutate only owned application data.
3. Compromise/revocation of one source does not affect sibling sources.
4. An accepted alert remains available even if push delivery fails.
5. Service-role and source credentials never appear in client bundles, logs,
   URLs, notification metadata, or analytics.
6. Notification content is bounded, retained for the declared period, and
   disclosed as data processed by push providers.
7. No notification capability can become arbitrary remote code execution.

## Assets

- Supabase secret/service-role key and project configuration.
- Per-source Bearer credentials and their hashes.
- User Auth sessions and linked email/OAuth identities; guests may still have
  no recovery identity.
- Expo push tokens and installation identifiers.
- Notification title, body, category, metadata, read state, and source snapshot.
- Source names, hostnames, activity, and revocation state.
- Database availability, migration integrity, cleanup schedule, and delivery logs.
- Apple/EAS signing, APNs, App Store Connect, and Supabase operator accounts.

## Actors

- authenticated owner;
- trusted sender application/operator;
- attacker with no credential;
- attacker with one stolen source credential;
- attacker with a stolen user session;
- malicious or compromised dependency/provider;
- service operator with privileged dashboard access;
- future developer accidentally weakening an authorization boundary.

## Trust boundaries

1. Sender machine to public `notify` Edge Function.
2. iOS/Android app to Supabase Auth, Edge Functions, Postgres RLS, and Realtime.
3. Edge Function service role to private/public database objects.
4. Backend to Expo Push Service and Apple APNs.
5. Developer/CI/EAS/Supabase/Apple administrative control planes.
6. Lock screen and other people with physical visibility of the phone.

## Threat register

| ID | Threat | Existing control | Required assurance or mitigation |
| --- | --- | --- | --- |
| T-01 | Source impersonates another source/account | Server hashes Bearer token and derives joined source/owner; no source selector | Cross-source/two-user contract tests; uniform invalid-token response |
| T-02 | Stolen source token sends false alerts | Independent credentials, rate limit, immediate revoke | OS-backed sender storage, rotation/replacement runbook, alert on anomalous source rate |
| T-03 | Token leaked through UI, logs, URL, metadata, or source control | One-time token, hash-only DB storage, header auth, no-store response | Secret scanning, log review, redaction tests, secure-copy UX, never include real tokens in support evidence |
| T-04 | User crosses tenant via direct table/API call | RLS plus owner filters in service-role handlers | pgTAP and Edge Function tests for read/update/delete/rename/revoke/token registration |
| T-05 | Disabled gateway JWT verification exposes functions | Handlers validate user token with Supabase Auth; source endpoint has independent auth | CI tests every anonymous/invalid/expired path; code-owner review on auth helper/config |
| T-06 | Service-role key reaches mobile or sender | Hosted secret and separate publishable key | Build artifact/secret scan, environment inventory, immediate rotation on exposure |
| T-07 | Payload exhausts memory/storage or injects UI content | Streamed 16 KiB request cap, field/metadata limits, React Native text rendering | Unicode/byte boundary tests, rate/capacity alerts, avoid interpreting metadata as HTML/URLs without validation |
| T-08 | Concurrent requests bypass rate limit | Per-source and per-account advisory transaction locks and request ledger | Parallel 60/61 integration test and load test |
| T-09 | Push failure loses accepted alert | DB insert and durable delivery jobs commit before the response; a worker retries transient failures and reconciles provider receipts | Fault-injection test, queue-age alert, synthetic inbox canary, clear API semantics |
| T-10 | Push content exposed on lock screen or to providers | iOS user settings; TLS in transit | Privacy disclosure, sender guidance not to send secrets, consider redacted push mode later |
| T-11 | Malicious metadata overwrites routing IDs | Server appends reserved notification/source IDs | Test collision behavior; construct reserved fields after untrusted metadata and validate detail authorization |
| T-12 | Stale push token sends to wrong account/device | Registration ownership conflict checks; current-installation unregister | Test reinstall/account-switch lifecycle; process Expo receipt invalidation in future |
| T-13 | Guest session hijacked or account orphaned | Session stored in OS-backed storage; guest has no recovery identifier; sign-out warns that it is permanent | Device tests for persistence/revocation, guest-loss warning, and same-UUID protection path |
| T-14 | Revoked source remains usable due race/cache | Ingestion checks `revoked_at` in DB | Concurrent revoke/ingest test; no credential caching outside transaction |
| T-15 | Cleanup fails and private content persists | `pg_cron` database expiry plus a Vault-authenticated Storage API cleanup job | Cron freshness/oldest-expired-row and attachment-object alerts |
| T-16 | Operator/dependency compromise | Provider IAM and lockfiles | MFA, least privilege, protected CI, dependency scans, audit logs, credential rotation drills |
| T-17 | Database migration weakens RLS/grants | Migration-defined RLS and explicit function grants | Schema diff, policy tests, migration review, production parity check |
| T-18 | Account deletion leaves personal data | `delete-account` function removes owned rows, then deletes the Auth user via admin API | End-to-end deletion verification; inventory provider logs/legal retention |
| T-19 | Console diagnostics leak content/provider responses | Errors and push tickets are logged/stored | Structured allowlisted fields, response-size bounds, restricted access, seven-day retention |
| T-20 | Future control feature enables remote shell | Controls excluded from v1 | Separate credentials/protocol/ADR, typed allowlist, consent, expiry, replay defense; prohibit shell strings |
| T-21 | Malicious or oversized image upload harms the device or storage | 5 MiB cap, magic-byte sniffing (PNG/JPEG/WebP only, never SVG), private bucket, owner-folder RLS, seven-day object cleanup | Contract tests for spoofed/oversize payloads; two-user storage read/delete test |
| T-22 | Runtime configuration is mistaken for authorization or injects unsafe behavior | Client keys are compiled/allowlisted; raw controls are private; server switches and RLS remain authoritative; no dynamic code/routes/SQL | Bootstrap parser tests, unknown-key rejection, security review for every new key |
| T-23 | A user subscribes to another account's Realtime invalidations | Private Broadcast topics include the owner UUID and `realtime.messages` policy compares it with `auth.uid()` | Two-user subscribe tests; keep payloads as invalidation-only and content-free |
| T-24 | A stale or malicious release rule blocks essential privacy/account access | Maintenance/update state renders a bounded banner; Privacy, sign-out, deletion, and source revocation are outside the runtime allowlist | Mobile tests and manual release-policy exercise before activation |
| T-25 | OAuth/magic-link callback is replayed, redirected, or completes the wrong intent | PKCE, exact redirect allowlist, state/nonce, short-lived single-use auth transaction | Foreground/background/terminated tests for replay, wrong state, wrong intent, expiry, cancellation, and provider denial |
| T-26 | Linking switches an anonymous user ID and strands or exposes guest data | Guest protection must link in place and verify the Auth user ID is unchanged | Tests for every provider, identity conflict, cache owner change, and preserved source credentials |
| T-27 | Two accounts are silently merged because provider emails match | No automatic application-level merge; conflict stops and requires proof of both sessions | Two-user/provider-conflict tests; v0.0.8 blocks protected-to-protected self-merge |
| T-28 | A user removes the final recovery method or an attacker links/unlinks one | Supabase requires another identity before unlink; Zona's UI additionally requires recent proof and emits a redacted audit/security notice | Link/unlink race and session-age tests; document that direct Supabase identity calls can bypass Zona's app-level proof gate |
| T-29 | Revoked phone retains access through an unexpired JWT | Installation/session revocation, account tombstone, and short access-token lifetime | Revoke-current/other/all-device tests and strict status checks on transfer/deletion |
| T-30 | Login, source, installation, and integration credentials become interchangeable | Separate principals, tables, scopes, and endpoints; no Supabase session accepted by `/notify` | Credential-confusion matrix across every endpoint; never expose provider or service tokens to sources |
| T-31 | Guest transfer partially moves sources, attachments, limits, or entitlements | Expiring dual-session proof, preview, account locks, idempotent server job, destination-wins rules | Fault injection at each transfer stage, retry/resume, attachment parity, and audit-result tests |
| T-32 | Protected user is phished or an email/social provider is taken over/unavailable | Native/provider-hosted auth, PKCE/state/nonce, multiple linkable methods, recent reauthentication, security notices | Provider takeover/recovery drill, email-delivery monitoring, suspicious link/unlink alerts, and support procedure that never bypasses proof |

## Abuse and capacity cases

- Invalid-token spraying: use uniform responses, platform rate controls, and
  alerts without logging credentials.
- Valid-token alert flood: transactional per-source (60/minute) and per-account
  (currently 20/minute for standard accounts) limits exist; add infrastructure safeguards if flooding across
  accounts is material.
- Notification duplication: `notify` requires an `Idempotency-Key`; identical
  replays return the stored record and key reuse with a changed payload is
  rejected. Duplicates remain possible if a sender mints a fresh key per
  attempt.
- Storage exhaustion: notification and request retention are bounded, and
  attachment storage is capped per image and purged on the same schedule, but
  source and push-device lifecycle needs monitoring and account deletion.
- Push fan-out amplification: a single notification fans out to every registered
  device; bound device counts or queue fan-out if usage grows.

## Credential lifecycle

### Source token

- Generate only server-side with cryptographic randomness.
- Return once over TLS with `Cache-Control: no-store`.
- Store only its SHA-256 hash server-side.
- Store the plaintext only in the sender’s OS-backed secret store.
- Replace by creating a new source, updating and testing the sender, then
  revoking the old source.
- If exposed, revoke immediately, review source activity/notifications, replace,
  and record an incident.

### Supabase secret/service-role key

- Restrict to hosted Edge Functions and authorized operators.
- Never prefix it with `EXPO_PUBLIC_`, place it in `.env` for the mobile app, or
  send it to a source integration.
- On exposure, rotate in Supabase, update hosted function secrets, redeploy and
  test, revoke the old key, inspect audit/function/database logs, and notify
  affected users if required. See [RUNBOOK.md](RUNBOOK.md).

### Publishable key and project URL

These are intentionally embedded in the mobile build. Security relies on Auth,
RLS, and function authorization, not their secrecy. Rotation still requires a
coordinated mobile build/environment update.

### Operator accounts

Require MFA for Supabase, Expo/EAS, Apple Developer/App Store Connect, source
control, and CI. Use individual accounts and least
privilege rather than shared credentials.

## Privacy considerations

Notification bodies can contain sensitive user-selected content and are sent to
Supabase, Expo, APNs, and potentially the iOS lock screen. The sender API should
discourage passwords, access tokens, health/financial secrets, or regulated
data. The privacy notice must list processors, purposes, retention, deletion,
and international transfer as applicable.

Data-access logs and push provider responses must be restricted to operators
with a support/security need. Never paste live notification payloads or tokens
into issue trackers or test artifacts.

## Residual risks accepted for version 1

These are acceptable only for private TestFlight scope and must remain visible:

- source credentials are long-lived and not hardware-bound;
- ambiguous sender retries may duplicate notifications;
- push remains best effort relative to the durable inbox, but uses a durable
  job queue with retries and receipt processing;
- source “last activity” is not presence;
- third-party provider availability is outside Zona’s direct control.

Any widening of distribution or sensitive-data use requires reapproval.

## Security release gates

- Threat register reviewed by the named security owner.
- No open critical/high finding; moderate exceptions have owner and expiry.
- RLS, cross-tenant, gateway-auth, rate-limit concurrency, payload, and
  revocation tests pass.
- Secrets scan both source and produced iOS bundle.
- Dependency and lockfile review passes for the SDK 56 constraint.
- Account deletion and retention are verified.
- Provider MFA, access list, key rotation, logging, and incident contacts are
  confirmed.
