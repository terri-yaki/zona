# Zona production runbook

Scope: private TestFlight notification service using Supabase, Expo Push
Service, APNs/FCM, and an Expo SDK 56 iOS/Android build.

This runbook intentionally contains placeholders for organization-specific
owners and URLs. A placeholder is a release blocker, not an instruction to use
a shared or default account.

## Ownership and contacts

| Role | Named owner | Contact/escalation |
| --- | --- | --- |
| Service owner | `REQUIRED` | `REQUIRED` |
| Incident commander backup | `REQUIRED` | `REQUIRED` |
| Security/privacy owner | `REQUIRED` | `REQUIRED` |
| Supabase administrator | `REQUIRED` | `REQUIRED` |
| Expo/EAS and Apple administrator | `REQUIRED` | `REQUIRED` |

Record dashboard, alert, status-page, release-ticket, and provider-support URLs
in the private operator system. Do not place access tokens in this document.

## Service semantics

- HTTP 202 from `notify` means the database accepted the inbox record.
- `pushQueued` (and compatibility `pushAttempted`) counts durable jobs enqueued
  for the worker. Compatibility `pushAccepted` remains zero on `/notify`
  because ticket and receipt work happens after the API response.
- Push is delivered by `push-delivery-worker` with bounded retries and receipt
  polling; an Expo receipt is provider feedback, not proof that the phone
  displayed the alert. The inbox remains authoritative if push is degraded.
- Users can recover an accepted alert through inbox synchronization.
- Notification rows, attachments, and associated push logs expire after seven days.
- Rate-limit request rows expire after one day.
- Safe client presentation rules are cached and may take up to the configured
  bootstrap refresh interval to appear; server switches and limits apply
  immediately and independently of the client cache.

## Minimum production telemetry

The v0.0.7 implementation and daily report setup are documented in
[OBSERVABILITY.md](OBSERVABILITY.md). Run
`scripts/configure-daily-report.ps1` after deploying its migration and Edge
Function; it provisions the scheduler credential without printing the Zona
source token.

Before release, configure structured, redacted events and dashboards for:

- Edge Function requests by function, status, latency, and request ID;
- notify acceptance, invalid-token, payload rejection, and rate-limit counts;
- delivery-job age/status, Expo request/ticket results, receipt outcomes, and
  permanent-failure counts;
- database/API errors and realtime connection health;
- oldest expired notification and last successful cleanup time;
- expired attachment objects and last successful Storage cleanup time;
- notification, request-log, push-device, and source row growth;
- Auth sign-in failure rate;
- synthetic source request and subsequent inbox visibility;
- EAS build/deployment identity and deployed function commit/checksum.

Recommended initial alerts:

| Signal | Initial trigger | Severity |
| --- | --- | --- |
| Synthetic accepted alert absent from inbox | Two consecutive checks | Critical |
| Notify 5xx rate | More than 5% for 5 minutes with at least 20 requests | High |
| Authenticated ingestion has no successful requests | Unexpected for normal traffic; tune after baseline | Medium |
| Expo request/ticket errors | More than 20% for 10 minutes | High; inbox may still work |
| Expired row age | Oldest expired row over 2 hours | High |
| Auth sign-in failure | More than 5% for 10 minutes | High |
| Database/storage usage | Provider warning threshold or forecasted exhaustion | High |

Tune thresholds after observing private usage, but never remove cleanup or
cross-tenant security alerts without owner approval.

## First response checklist

1. Acknowledge the alert and open an incident record with UTC start time.
2. Determine whether acceptance, inbox reads, Auth, or only push is affected.
3. Check Supabase, Expo, and Apple provider status pages.
4. Confirm the affected release/build, function deployment, migration, and
   environment; do not make speculative production changes.
5. Capture request IDs, timestamps, status codes, source UUIDs, and notification
   UUIDs. Never capture source tokens, user sessions, or unnecessary content.
6. Preserve evidence and assign incident commander/communications owner.
7. Prefer the documented rollback/repair path. Record every mutation.
8. After recovery, verify the synthetic flow and representative real user flow.

For a controlled maintenance window, use the reviewed operations in
[RUNTIME_CONTROLS.md](RUNTIME_CONTROLS.md). Client feature controls are not an
incident substitute for server-side service switches.

## Safe diagnostic checks

Use synthetic credentials only. Keep shell history and CI logs private.

```sh
curl --fail-with-body --max-time 10 \
  -X POST "$ZONA_NOTIFY_URL" \
  -H "Authorization: Bearer $ZONA_SOURCE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"title":"Synthetic check","body":"Runbook canary","category":"ops","data":{"eventId":"UNIQUE_SYNTHETIC_ID"}}'
```

Expected: HTTP 202 with notification/source UUIDs. Then verify the row using the
test owner’s authenticated app or a least-privileged test harness. Do not use a
service key merely to make a health check convenient.

Read-only cleanup diagnostics from the Supabase SQL editor:

```sql
select now() as checked_at,
       count(*) as expired_notifications,
       min(expires_at) as oldest_expired_at
from public.inbox_notifications
where expires_at <= now();

select jobname, schedule, active
from cron.job
where jobname = 'zona-delete-expired-data';
```

Use provider log exploration for request IDs/time windows. Do not query or
export notification content unless strictly necessary and authorized.

## Incident playbooks

### Notification API elevated 5xx

1. Separate Edge Function initialization, Auth, database RPC, and provider-push
   failures by structured stage.
2. Confirm project secrets exist and deployed function source matches release.
3. Check database availability, connection/provider limits, migration state,
   advisory-lock waits, storage, and function logs.
4. If durable insertion succeeds but push is degraded, communicate “inbox
   available, push degraded”; inspect `private.push_delivery_jobs` and the
   worker rather than replaying accepted notifications.
5. If a new function deployment caused the fault and schema remains compatible,
   redeploy the previous known-good function bundle.
6. If a migration caused it, use a reviewed forward repair unless the migration
   has a tested safe rollback. Never manually drop production data during triage.

### Push delivery degradation

1. Verify accepted inbox rows exist; this determines whether the core service
   remains available.
2. Check `push-delivery-worker` invocations, `private.push_delivery_jobs`
   status counts, and Expo/APNs status by time window.
3. Distinguish claim/lease stalls, HTTP transport failure, ticket errors,
   receipt permanent failures, invalid/stale device tokens, and user-disabled
   permissions.
4. Do not replay notifications without user/product approval; the durable queue
   already retries transient failures, and duplicates may be harmful.
5. Ask affected users to refresh inbox and, if appropriate, re-register the
   current installation from Settings.
6. Track permanent `DeviceNotRegistered` volume; the worker disables those
   registrations from receipt feedback.

### Inbox/realtime degradation

1. Test direct authenticated refresh separately from realtime updates.
2. Check Supabase database/API/Realtime status and RLS errors.
3. Confirm the app session is valid and the retained notification is unexpired.
4. Verify publication configuration and deployed schema parity.
5. The v0.0.12 client resubscribes dropped Realtime channels silently (first
   retry after 5 seconds, exponential backoff up to one attempt per minute,
   deferred while backgrounded until the next foreground transition), so a
   transient Realtime blip recovers without user action. If realtime stays
   down past that retry loop, communicate manual refresh as temporary
   mitigation.

### Sign-in failure

1. Check Supabase Auth status and quota, and confirm anonymous sign-ins are
   still enabled for the project.
2. Test with a designated operator installation; never request a user's session
   token.
3. Invalidate affected sessions and rotate the publishable key if exposure is
   suspected.

### Cleanup/retention failure

1. Run the read-only queries above and inspect `cron.job_run_details` for the
   named job, subject to least-privilege access.
2. Confirm `pg_cron` availability, active job, SQL errors, locks, and database
   capacity.
3. Restore scheduling through a reviewed migration/configuration change.
4. A one-time deletion is destructive: obtain service/privacy owner approval,
   preview exact counts/time bounds, and use a reviewed transaction. Do not run
   ad hoc broad deletion from this runbook.
5. Record the actual retention breach and assess notification requirements.

### Compromised source token

1. Revoke the named source immediately from the app using its stable UUID.
2. Verify subsequent requests receive uniform invalid-token rejection.
3. Review that source’s timestamps/rate/notification UUIDs for suspicious use;
   minimize content access.
4. Create a replacement source, store its token securely, update the sender,
   send a synthetic event, then keep the old source revoked.
5. Do not rename/reuse the compromised source as a substitute for revocation.
6. Determine how the token escaped and fix logs, environment, source-control, or
   support processes. Search using hashes/known locations without echoing it.

### Supabase secret/service-role key exposure

Treat a credential pasted into chat, issue trackers, terminal logs, or source as
compromised even if later deleted.

1. Declare a security incident and restrict access to the leaked artifact.
2. Rotate/create the Supabase secret through the project’s supported key
   management flow.
3. Update only hosted backend secrets. Never add it to `zona/.env` or use an
   `EXPO_PUBLIC_` name.
4. Redeploy/restart affected Edge Functions and run anonymous, user-auth, source,
   cross-tenant, ingest, and push-failure smoke tests.
5. Revoke the old credential as soon as the new deployment is verified.
6. Review Auth, database, function, and provider audit logs from earliest
   possible exposure; check for unauthorized writes, user access, or key use.
7. Rotate adjacent credentials if the exposure environment contained them.
8. Complete impact/privacy assessment and notification obligations.

### User-session exposure

1. Revoke affected sessions through Supabase Auth and help the user sign in
   again.
2. Review account source-management and notification actions.
3. Revoke/replace sources changed during the compromise window.
4. Investigate device and storage compromise; an orphaned anonymous account
   cannot be recovered, so plan source recreation.

### Production deployment regression

Follow [RELEASE.md](RELEASE.md). Mobile binaries already installed cannot be
recalled. Stop rollout if possible, restore the previous compatible Edge
Function, or ship an expedited corrected build. No EAS Update/OTA rollback is
assumed because it is not currently configured.

## Backup and restore

- Configure provider backups/PITR appropriate to the approved RPO/RTO.
- Record plan/tier, backup frequency, retention, region, encryption, and named
  restore authority privately.
- Test restore into an isolated non-production project at least quarterly or
  before broader distribution.
- Verify Auth ownership, RLS, private schema, functions, Realtime publication,
  cleanup job, and representative data after restore.
- Never overwrite production as a “test.” Provider restore is a privileged,
  destructive operation requiring incident commander and data-owner approval.

## Credential rotation schedule

| Credential | Trigger/maximum interval | Verification |
| --- | --- | --- |
| Supabase secret/service role | Exposure, owner departure, provider policy, and approved periodic interval | Edge Function auth/cross-tenant smoke suite |
| Supabase publishable key | Provider policy/exposure response | New EAS build and Auth/RLS smoke |
| APNs/EAS/Apple signing | Exposure, expiry, team change, provider policy | TestFlight push matrix |
| Source token | Suspected exposure or sender transfer/decommission | Replacement event then old-source rejection |

Never rotate without a rollback/overlap plan where the provider supports it.

## Data-subject/account deletion operations

The release must provide in-app initiation. The server-side operation should:

1. require a current user and explicit confirmation/reauthentication;
2. unregister push delivery;
3. delete the Supabase Auth user using a privileged server-only path so database
   cascades remove application data;
4. report completion or bounded processing time;
5. retain only data with a documented legal basis and communicate it;
6. record a privacy-safe audit event without retaining deleted content.

Until this path exists and is tested, external distribution is blocked.

## Post-incident review

Within five business days, record timeline, detection, scope, user impact, root
cause, contributing conditions, recovery, evidence, privacy/security assessment,
and owned corrective actions with deadlines. Update the threat model, tests,
alerts, runbook, and PRD when assumptions change.
