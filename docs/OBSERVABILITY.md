# Zona observability and daily pulse

Zona v0.0.7 keeps operational diagnostics separate from product data and sends
one private daily service pulse to the operator's Zona source.

## Data model

| Relation | Retention | Contents |
| --- | --- | --- |
| `private.client_event_logs` | 30 days | App lifecycle, API outcome, and uncaught/error-boundary events with version, build, platform, and installation ID |
| `private.server_event_logs` | 30 days | Relay/database outcomes, status, latency, request ID, and safe entity IDs |
| `private.daily_usage_stats` | 400 days | HKT service and per-user totals, independent of raw-log retention |
| `private.daily_report_runs` | 90 days | Idempotency and outcome ledger for each daily report |
| `private.push_delivery_logs` | Notification lifetime | Existing per-device Expo ticket diagnostics used by the aggregates |

Raw logs must never contain notification titles/bodies, attachments, source
tokens, push tokens, session tokens, email addresses, or arbitrary request
payloads. Client context is capped at 4 KiB, server context at 8 KiB, and client
logging is limited to 300 events per account per hour.

The mobile app writes through `record_client_event`, which always derives the
owner from `auth.uid()`. It has no direct access to the private log table. Edge
Functions write through the service-only `record_server_event_internal` RPC.

## Developer-only daily report

This is an operator/developer report. It is not listed as an end-user feature,
is not sent to customer accounts, and cannot be queried by authenticated or
anonymous clients. Private tables are inaccessible to the mobile API, report
RPCs are granted only to `service_role`, and the finished report is sent only
to the operator source configured by `ZONA_REPORT_TOKEN`.

The reporting day cuts off at exactly 00:00 HKT. At 00:05 HKT (`16:05 UTC`),
`pg_cron` invokes `daily-stats-report`. The function:

1. regenerates the previous Hong Kong calendar day's service and per-user aggregates;
2. claims the date in `daily_report_runs` so retries cannot duplicate a report;
3. renders a seven-day PNG chart inside the Edge runtime without an external
   charting service;
4. submits the summary and PNG to Zona through the ordinary authenticated
   `/v1` notification path; and
5. records the resulting notification ID or failure.

The labeled chart uses green for notifications triggered, purple for active
users, yellow for accepted push tickets, and red for combined client, server,
and push errors. The summary also reports new and total users, new/active/total
keys, app opens, active installations, sending sources, and push-enabled phones.
Aggregates contain counts only; no notification content is sent to the chart.

The attachment is PNG rather than PDF. Zona's existing private attachment path
creates an owner-scoped signed URL and opens the image in its full-screen,
pinch-to-zoom viewer on iOS and Android, so no separate document renderer is
required.

## Configure production

After applying the v0.0.7 migrations and deploying both `notify` and
`daily-stats-report`, run from the repository root:

```powershell
.\scripts\configure-daily-report.ps1
```

The script reads the operator source credential from
`C:\Users\hoyul\.zona\token` without printing it. It generates a separate
scheduler secret, stores Edge secrets, stores only the scheduler secret and
project URL in Supabase Vault, and creates the `zona-daily-stats-report` cron
job. Temporary secret files are deleted in a guarded `finally` block.

Verify without reading secrets:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('zona-daily-stats-report', 'zona-observability-retention');

select report_date, status, notification_id, started_at, completed_at, error_message
from private.daily_report_runs
order by report_date desc
limit 7;
```

To request a report manually, invoke the Edge Function with the configured
`x-daily-report-secret`. Reusing a completed date returns `alreadySent: true`.
