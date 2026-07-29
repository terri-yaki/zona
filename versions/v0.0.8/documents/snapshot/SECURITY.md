# Security policy

Zona is currently a private, pre-production TestFlight project. The existence
of this policy does not mean the service has completed its release security
gates. See the [threat model](docs/THREAT_MODEL.md) and
[test plan](docs/TEST_PLAN.md).

## Supported versions

Only the latest explicitly approved TestFlight build and its matching deployed
Supabase schema/Edge Functions are supported. Version 1 is pinned to Expo SDK
54. Older builds should be removed from tester access after a replacement is
verified.

## Reporting a vulnerability

Before distribution, replace the placeholders below with a monitored private
security contact:

- Security email: `REQUIRED_BEFORE_RELEASE`
- Response owner: `REQUIRED_BEFORE_RELEASE`
- Acknowledgment target: 2 business days; urgent credential/data incidents are
  acknowledged according to the production incident policy.

Include a concise description, affected build/function, reproduction steps,
impact, and timestamps/request IDs when available. Do not include live source
tokens, Supabase sessions/keys, push tokens, or real notification
content. The maintainer will coordinate a safe channel for sensitive evidence.

Do not test against accounts, sources, or data you do not own. Avoid denial of
service, social engineering, provider-account access, or privacy-impacting
testing.

## Security model

- Mobile clients contain only the Supabase project URL and public/publishable
  key. Authorization is enforced by Supabase Auth, row-level security, and
  authenticated Edge Functions.
- Senders receive a separate opaque credential per source. The backend stores
  only its SHA-256 hash and derives source/owner identity from it.
- Sender applications call only the bounded notification Edge Function; they do
  not receive database or service-role access.
- Notifications are inserted before best-effort push delivery.
- Source credentials are independently and immediately revocable.
- Notifications and associated push-delivery diagnostics expire after seven
  days; rate-limit request rows expire after one day.
- Future PC control is out of scope. Arbitrary remote shell execution is
  prohibited.

## Credential handling

Never commit, paste, log, screenshot, or transmit through notification metadata:

- Supabase secret/service-role keys;
- source `zona_live_…` tokens;
- user access/refresh tokens;
- Expo/Apple administrative credentials;
- production push tokens unless required in a restricted provider workflow.

Source tokens should be stored in an OS-backed secret store. On suspected
source exposure, revoke that source, create and verify a replacement, and
investigate the leak. On Supabase secret exposure, follow the immediate rotation
and audit procedure in [RUNBOOK.md](docs/RUNBOOK.md). Deleting a message or
commit containing a credential does not make the credential safe again.

Public/publishable Supabase keys are designed for client embedding, but builds
must still target the correct project and rely on tested RLS—not key obscurity.

## Dependency and change policy

- Use lockfile installs in CI and review dependency diffs.
- Run dependency, secret, static, Expo compatibility, Deno, database/RLS, and
  produced-bundle scans for every release.
- No critical/high finding may ship. A moderate exception needs documented
  impact, mitigation, owner, approval, and expiry.
- Do not use a forced dependency fix that silently upgrades beyond Expo SDK 56.
  Resolve or explicitly assess transitive advisories against the supported SDK.
- Authentication, RLS/grants, secret access, security-definer functions,
  retention, and push payload changes require security-owner review.
- Production dashboard edits must be reconciled into version-controlled config
  and deployed source.

## Privacy and incident response

Notification content is processed by Supabase, Expo Push Service, and Apple
APNs and may appear on an iPhone lock screen. Do not use Zona for secrets or
regulated/sensitive data without an approved privacy/security assessment.

Security incidents follow [RUNBOOK.md](docs/RUNBOOK.md): contain and rotate
credentials, preserve minimal evidence, determine access and data impact,
restore verified service, communicate as required, and complete a post-incident
review. Account deletion and the published privacy notice are release gates.

