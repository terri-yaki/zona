
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
supabase functions deploy manage-source
supabase functions deploy register-push-token
supabase functions deploy notify
supabase functions deploy delete-account
supabase functions deploy cleanup-expired --no-verify-jwt
```

The hosted Edge Functions receive the project environment automatically. The
shared client supports the current `SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY` names plus the legacy `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` names. Never expose a secret/service-role key to the
Expo app or a source application.

In Authentication → Sign In / Providers, enable anonymous sign-ins — the app
uses `signInAnonymously` and collects no email (see ADR 0002). No SMTP
provider or redirect allowlist is needed.

The migrations enable `pg_cron`, schedule hourly database expiry cleanup,
enable Realtime for the inbox, create the private attachment bucket, and create
all row-level security policies. Attachment objects must be removed through the
Storage API rather than direct SQL. Set the same random `CLEANUP_SECRET` as an
Edge Function secret and a Vault secret named `zona_cleanup_secret`, enable
`pg_net`, and schedule `cleanup-expired` hourly with that value in the
`x-cleanup-secret` header. The deployed project uses the job name
`zona-cleanup-expired-attachments` at `17 * * * *`.

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

- Review Edge Function logs for `best-effort push failed` messages.
- Revoke a compromised source from the Sources tab immediately.
- Rotate Supabase service credentials according to the project policy.
- Keep both hourly cleanup jobs enabled so database rows and Storage objects
  remain bounded.
