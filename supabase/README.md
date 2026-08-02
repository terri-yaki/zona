
# Supabase setup

## Prerequisites

- A Supabase project.
- Supabase CLI authenticated to that project.
- An Expo/EAS project configured for iOS push notifications.

## Deploy

From the repository root:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-source
supabase functions deploy create-source-key
supabase functions deploy manage-source
supabase functions deploy manage-source-key
supabase functions deploy auth-transaction
supabase functions deploy reauthenticate
supabase functions deploy account-security
supabase functions deploy account-transfer
supabase functions deploy register-push-token
supabase functions deploy notify
supabase functions deploy push-delivery-worker --no-verify-jwt
supabase functions deploy test-source
supabase functions deploy delete-account
supabase functions deploy cleanup-expired --no-verify-jwt
supabase functions deploy daily-stats-report --no-verify-jwt
```

The hosted Edge Functions receive the project environment automatically. The
shared client supports the current `SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY` names plus the legacy `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` names. Never expose a secret/service-role key to the
Expo app or a source application.

In Authentication → Sign In / Providers, keep anonymous sign-ins enabled for
the one-tap guest path. For recoverable accounts, also enable email and manual
identity linking, configure the Apple/Google/GitHub providers you intend to
offer, and add the exact `zona://auth/callback` plus development `exp://`
redirects. Provider secrets stay in Supabase and never enter the Expo bundle.
The app reads the public Auth settings endpoint and hides methods that are not
enabled.

The migrations enable `pg_cron`, schedule hourly database expiry cleanup,
enable Realtime for the inbox, create the private attachment bucket, and create
all row-level security policies. Attachment objects must be removed through the
Storage API rather than direct SQL. Set the same random `CLEANUP_SECRET` as an
Edge Function secret and a Vault secret named `zona_cleanup_secret`, enable
`pg_net`, and schedule `cleanup-expired` hourly with that value in the
`x-cleanup-secret` header. The deployed project uses the job name
`zona-cleanup-expired-attachments` at `23 * * * *`.

The durable push worker also needs a random `PUSH_WORKER_SECRET` in the Edge
Function environment and the same value in Vault as
`zona_push_worker_secret`; `configure_v0_0_8_workers_internal` schedules it
every minute with the `x-push-worker-secret` header. `EXPO_ACCESS_TOKEN` is
optional unless Expo push access-token security is enabled for the project.

The developer-only daily report needs `DAILY_REPORT_SECRET` and
`ZONA_REPORT_TOKEN` in the Edge Function environment. Store the same report
secret in Vault as `zona_daily_report_secret`; the configured cron runs at
16:05 UTC (00:05 HKT) and reports the completed Hong Kong calendar day whose
cutoff was 00:00 HKT. `ZONA_REPORT_TOKEN` is an independent source token for
the developer's private report destination—never a customer-facing setting.
The scheduler also needs Vault secret `zona_project_url`. Keep all values out
of migrations, Git history, and shell output.

## Local development

```sh
supabase start
supabase db reset
supabase functions serve --env-file supabase/.env.local
```

Use the local values printed by `supabase status` in `zona/.env`. Push testing
requires a physical device, a linked EAS project ID, and a development or store
build; Expo Go cannot receive remote push notifications. Android additionally
requires the push transport configuration in `../docs/ANDROID_PUSH.md`.

## Operational checks

- Review `push-delivery-worker` events and the private delivery queue for retry,
  receipt, and permanent-failure trends. `/notify` returning `202` means the
  inbox row exists; it does not wait for Expo.
- Revoke a compromised source from the Sources tab immediately.
- Rotate Supabase service credentials according to the project policy.
- Keep both hourly cleanup jobs enabled so database rows and Storage objects
  remain bounded.
- Keep the worker and developer-only daily report schedules enabled only after
  their secrets and operator destinations are configured.
