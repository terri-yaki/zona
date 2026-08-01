# Zona

Zona is a private, multi-source notification inbox for iOS and Android. Any local app can
send an alert through an authenticated Supabase Edge Function; Expo delivers the
push and the app keeps a seven-day inbox.

## Projects

- `zona/` — Expo Router mobile application (Expo SDK 56).
- `supabase/` — database migration and Edge Functions.
- `examples/` — small PowerShell and Node.js senders that document the API.

## Quick start

1. Create a Supabase project and run `supabase db push` from this directory.
2. Set the Edge Function secrets described in `supabase/README.md`, then deploy
   the functions.
3. Copy `zona/.env.example` to `zona/.env` and fill in the public Supabase
   project URL and publishable key. Never put a secret key in the Expo app.
4. Add your EAS project ID to `zona/app.json`, install dependencies, and run
   `npm start` inside `zona/`.
5. Continue as a guest or sign in, create one source per PC/app, and copy the
   source token when it is displayed. Tokens are never shown again; add a new
   labelled key before revoking an old one when a sender needs rotation.

See `docs/API.md` for the notification request contract and production notes.
Android push and EAS setup is documented in `docs/ANDROID_PUSH.md`.
Preview app updates (OTA vs new IPA) are documented in `docs/PREVIEW_UPDATES.md`.

For a quick Windows test after creating a source token in the app:

```powershell
$env:ZONA_SOURCE_TOKEN = 'zona_live_...'
.\examples\send-notification.ps1 -Title 'PC connected' -Body 'This came from Windows.'
```

The deployed sender endpoint is
`https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify`. The source token
is the only sender credential; never use a Supabase secret key in a local app.

The **API Keys** tab shows each key's name, safe prefix, last use, active state,
per-source notification sound, and a reusable test-alert action. Settings
includes server-backed switches for push delivery, global sound, and
lock-screen message previews.

## Production-readiness documentation

- `docs/PRD.md` — product scope, requirements, acceptance matrix, and blockers.
- `docs/ARCHITECTURE.md` — data flow, trust boundaries, and extension rules.
- `docs/ACCOUNT_MANAGEMENT.md` — v0.0.8 guest protection, provider sign-in,
  recovery, devices, deletion, and future integration boundaries.
- `docs/openapi.yaml` — machine-readable Edge Function API contract.
- `docs/TEST_PLAN.md` — automated and physical-iPhone release verification.
- `docs/ROADMAP.md` — v0.0.8–v0.0.10 architecture and the path to Zona Plus.
- `docs/CHANGELOG_WRITING.md` — benefit-led, non-technical What's New copy.
- `docs/BRANDING.md` — Zona Notify naming, voice, store copy, and N-to-Z motion.
- `versions/` — separate database and documentation packages for v0.0.1–v0.0.6.
- `docs/THREAT_MODEL.md` and `SECURITY.md` — risks and security policy.
- `PRIVACY.md` — release-draft data and retention notice.
- `docs/RUNBOOK.md` and `docs/RELEASE.md` — operations and TestFlight release.
- `docs/PUBLIC_LAUNCH_PLAN.md` — public distribution, monetization, hosting,
  DevOps, and measured scaling roadmap.

Zona is pre-production while the explicit release blockers in the PRD and
release procedure remain open.

## Security model

Local apps never receive a Supabase service key and never write to database
tables. A source token authenticates only the `/notify` Edge Function. The
server hashes tokens, derives the source identity from the hash, rate-limits
each source, and applies database row-level security to mobile inbox reads.
