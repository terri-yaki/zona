# Zona test plan

This plan is the release-verification contract for the private TestFlight
version of Zona. It covers the Expo SDK 54 app, Supabase migration and Edge
Functions, sender API, and physical-iPhone push behavior.

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

Backend gates must run in a pinned Deno/Supabase CLI environment:

```sh
deno fmt --check supabase/functions
deno lint supabase/functions
deno check supabase/functions/*/index.ts
deno test supabase/functions
supabase db reset
```

Add repository scripts or CI jobs for database/RLS tests, Edge Function
contract tests, an SDK-54-compatible dependency audit, secret scanning, and
migration drift. Generated output and credentials must not be committed.

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
- user/account deletion cascades through all owned data.

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
- forced Expo timeout, non-JSON response, non-2xx response, partial ticket
  errors, and zero-device behavior;
- failed push retains the inbox row and records a bounded diagnostic;
- HTTP 429 includes `Retry-After`;
- revoked token and token for another source fail without information leakage;
- multipart accepts one PNG/JPEG/WebP image up to 5 MiB and rejects spoofed
  magic bytes, SVG, renamed executables, oversize files, and requests over
  6 MiB with the documented statuses;
- a replay with the identical image returns 200 without re-upload, and the
  same key with a different image returns 409;
- a forced Storage failure still returns 202 with `attachmentAccepted: false`
  and retains the inbox row.

User-authenticated functions require two-user tests for cross-account rename,
revoke, push registration, token conflict, and deletion. Gateway JWT checking is
disabled, so tests must prove each handler validates Supabase Auth itself.

### Mobile component and integration tests

Use React Native Testing Library with network/native modules mocked at their
boundaries. Cover:

- anonymous sign-in pending, success, and provider error;
- expired/invalid saved-session restoration;
- push onboarding for granted, denied, simulator, Expo Go, web, missing EAS
  project ID, and provider error;
- source creation, one-time token warning/copy, rename, revoke, and all error
  states;
- inbox loading, empty, error, refresh, realtime insert/update/delete,
  pagination, source/unread/date filters, and filter count semantics;
- notification read and delete authorization/errors, including early purge of
  an attached image;
- attachment loading, rendering, and failure states in the detail screen, and
  the inbox attachment badge;
- notification interaction routing with missing, malformed, or unauthorized IDs;
- current-installation registration refresh and safe sign-out;
- offline transitions and recovery without representing errors as an empty inbox.

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

## Physical-iPhone TestFlight matrix

Run on at least one currently supported physical iPhone/iOS version and, before
external reliance, the oldest supported iOS version. Record device model, iOS,
build ID, EAS build URL, account, time, and evidence link.

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
| Magic link from Mail | Deep link returns to app and restores intended routing |
| Seven-day boundary | Expired item disappears and current item remains |
| VoiceOver and large text | Primary flows remain understandable and operable |
| Lock-screen preview settings | Content exposure matches documented user expectations |

Expo Go results do not satisfy any remote-push row.

## Security and abuse tests

- replaying a valid notification request may create a duplicate; verify this is
  documented and does not cross source scope;
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
| Expo Doctor + SDK 54 dependency check |  |  |  |  |
| Dependency/security/secret scan |  |  |  |  |
| iOS production export/build |  |  |  |  |
| Multi-source E2E |  |  |  |  |
| TestFlight physical-device matrix |  |  |  |  |
| Privacy/account-deletion verification |  |  |  |  |
| Migration/function deployment parity |  |  |  |  |
| Monitoring and rollback rehearsal |  |  |  |  |

## Exit criteria

- Every PRD acceptance row is linked to current evidence.
- No severity-critical/high security finding is open. Moderate findings require
  an owner, mitigation, expiry, and approval.
- No known crash, data-isolation defect, accepted-alert loss, or account-deletion
  defect is open.
- All external identifiers, credentials, URLs, privacy metadata, and
  owners are complete.
- Release owner signs [RELEASE.md](RELEASE.md).

