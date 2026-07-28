# Zona release procedure

This is the required procedure for a private TestFlight release. Zona version 1
is pinned to Expo SDK 54. A release is not complete when a local bundle compiles;
it is complete only after the signed build and hosted backend pass the recorded
acceptance matrix.

## Roles and approvals

Assign before starting:

| Role | Owner | Approval |
| --- | --- | --- |
| Release owner | `REQUIRED` |  |
| Mobile reviewer | `REQUIRED` |  |
| Backend/database reviewer | `REQUIRED` |  |
| Security/privacy reviewer | `REQUIRED` |  |
| TestFlight device tester | `REQUIRED` |  |
| Incident/rollback owner | `REQUIRED` |  |

## Versioning policy

- App semantic version is `major.minor.patch` in Expo configuration.
- EAS remote build number auto-increments for store submissions.
- Native dependency or app-configuration changes require a new binary.
- Expo SDK stays on major 54 for version 1. An SDK upgrade requires an ADR,
  compatible package plan, fresh native build, and full TestFlight matrix.
- EAS Update/OTA is not currently configured or an approved release path.
- Tag the immutable source revision used for backend and app artifacts.

## External blockers

Do not start a production build until all are resolved:

- owned bundle identifier replaces `com.example.zona`;
- linked EAS project UUID replaces `REPLACE_WITH_EAS_PROJECT_ID`;
- Apple Developer/App Store Connect app, team, agreements, and signing access;
- APNs key/provisioning and production EAS environment;
- EAS production values for `EXPO_PUBLIC_SUPABASE_URL` and the public
  publishable key, with no secret/service-role key;
- production Supabase project, migrations, functions, Realtime, cron, Auth
  anonymous sign-in enabled, and rate/security settings;
- hosted privacy policy and support URLs, App Store privacy answers, account
  deletion, reviewer instructions, age rating, and export compliance;
- final icon, splash, screenshots, name/subtitle/description, and support contact;
- named production owners, alerts, dashboard, backup plan, and runbook contacts.

## Change preparation

1. Update [CHANGELOG.md](../CHANGELOG.md) under Unreleased and classify database,
   function, mobile, privacy, and operator impact.
2. Link each change to PRD requirement/acceptance IDs and tests.
3. Review migrations for locks, forward compatibility, RLS/grants, cleanup, and
   recovery. Prefer expand/migrate/contract across releases.
4. Review Edge Function/mobile contract compatibility. An installed older build
   may remain active throughout rollout.
5. Review [THREAT_MODEL.md](THREAT_MODEL.md) for changed trust boundaries or data.
6. Update API/OpenAPI and privacy/App Store answers before changing collection.
7. Resolve or formally accept dependency/security findings with owner and expiry.

## Clean verification

From a clean checkout, install the lockfile exactly and run every automated gate
in [TEST_PLAN.md](TEST_PLAN.md). Record command output, source revision, Node,
Deno, Supabase CLI, EAS CLI, Xcode/EAS image, and Expo SDK versions in the
release ticket.

Required outcomes:

- typecheck, lint, mobile tests, Deno checks/tests, database/RLS/contract tests;
- Expo dependency check and Expo Doctor on SDK 54;
- iOS production export;
- dependency, static, and secret scans, including produced bundle;
- migration reset from zero and upgrade from previous production schema;
- multi-source concurrency and forced-push-failure E2E;
- account deletion and retention verification.

Blank evidence or an unavailable test runner is a failed gate.

## Backend deployment

Use reviewed Supabase CLI automation tied to the immutable revision; avoid
editing production function source manually in the dashboard.

Recommended order:

1. Confirm linked project reference and operator identity without printing keys.
2. Back up/confirm PITR and capture current schema/function deployment identity.
3. Apply backward-compatible database migrations.
4. Verify policies, grants, cron job, and database smoke tests.
5. Deploy shared-compatible Edge Functions.
6. Run anonymous, user A/user B, source, cross-tenant, revoke, ingest, forced
   push-failure, and cleanup smoke tests.
7. Compare deployed source/checksum and migration list to the release revision.
8. Observe dashboards through the agreed bake period before mobile rollout.

Never apply a destructive rollback or data rewrite without reviewed SQL, exact
scope preview, backup evidence, and data-owner approval.

## EAS production build

After configuration and backend bake:

```sh
cd zona
npx eas-cli login
npx eas-cli build --platform ios --profile production
```

Verify in the EAS artifact/build details:

- correct owner/project, Git revision, SDK 54, app version, and incremented build;
- production bundle identifier and environment target;
- no placeholder identifiers or secret/service-role material;
- notification, secure-store, router, and signing configuration;
- build provenance/logs retained in the release ticket.

Do not submit a build produced from uncommitted or unreviewed source.

## TestFlight verification

Upload to an internal TestFlight group first. Complete the physical-device
matrix in [TEST_PLAN.md](TEST_PLAN.md), including:

- fresh install and anonymous sign-in;
- permission accepted/denied;
- two sources sending concurrently;
- correct source in foreground/background/terminated push and inbox/detail;
- rename snapshot, duplicate hostname, and independent revoke;
- offline refresh/recovery and forced push failure with retained inbox record;
- source/unread/date pagination beyond 200 rows;
- token refresh/reinstall/sign-out;
- account deletion;
- VoiceOver, large text, contrast, lock-screen disclosure, and seven-day boundary.

Record model, iOS, build number, time, tester, expected/actual result, and
evidence. Use synthetic notification content only.

## Submission and staged rollout

1. Confirm privacy/support URLs, App Store answers/metadata, reviewer access and
   notes, screenshots, age rating, and export compliance match the build.
2. Confirm production monitoring, backup, on-call contacts, and provider status
   links are operational.
3. Submit only the tested build:

   ```sh
   cd zona
   npx eas-cli submit --platform ios --profile production
   ```

4. Start with the smallest authorized private TestFlight group.
5. Monitor Auth, notify acceptance/latency/status, Expo ticket errors, realtime,
   cleanup freshness, and user feedback during the bake window.
6. Expand only after the release owner reviews results.

## Rollback and recovery

### Mobile binary

An installed TestFlight binary cannot be remotely removed. Stop adding testers,
expire/disable the affected build where supported, communicate the issue, and
ship a corrected binary. Do not rely on OTA rollback because EAS Update is not
configured.

### Edge Functions

If schema/API compatibility permits, redeploy the previous reviewed function
bundle and run its smoke suite. Record deployment identity and incident. Never
restore code that expects a schema already removed by a migration.

### Database

Prefer a reviewed forward repair. Use provider PITR/restore only through the
incident and data-restore process in [RUNBOOK.md](RUNBOOK.md). A migration must
state recovery strategy before production application.

### Credentials

For exposure, follow the rotation playbook rather than rolling back to a known
compromised key. Coordinate public-key/mobile changes because installed builds
retain their embedded configuration.

## Release sign-off

Copy into the release ticket:

| Gate | Evidence | Owner approval |
| --- | --- | --- |
| Immutable source revision/tag |  |  |
| PRD requirements/acceptance matrix |  |  |
| Automated CI and security results |  |  |
| Schema migration and deployment parity |  |  |
| Production identifiers/environment |  |  |
| TestFlight device matrix |  |  |
| Privacy/account deletion/App Store metadata |  |  |
| Monitoring/alerts/backups/runbook |  |  |
| Rollback rehearsal |  |  |
| Changelog/release notes |  |  |

All rows require evidence and approval. Archive the ticket with the build and
deployment identifiers.

## Post-release

- Monitor the bake window and record any alert/user report.
- Confirm synthetic flow and cleanup freshness the next scheduled cycle.
- Close the changelog release with date/version.
- Review dependency advisories and operational trends.
- Run a retrospective for incidents or escaped defects and update PRD, tests,
  threat model, and runbook.
