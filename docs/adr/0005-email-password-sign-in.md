# ADR 0005: Email and password sign-in

- Status: Accepted for v0.0.12
- Date: 2026-08-05
- Owners: Product and engineering owner to be assigned before implementation

## Context

ADR 0004 made Zona recoverable by linking verified identities to an anonymous
user. v0.0.8 shipped passwordless email (OTP/magic link), Apple, Google, and
GitHub. Some users prefer a conventional email-and-password credential, and a
password is easier to save in a password manager and reuse across devices than
an emailed link or OTP. Adding password sign-in also lets Zona advertise
"Protect your Zona with an email and password" as a familiar recovery path.

Supabase Auth already supports email/password through the Email provider.
Passwords are stored as bcrypt hashes by Supabase; Zona never stores or logs
the plaintext. The remaining product questions are how to confirm new email
addresses, how to route pending confirmations in the app, and how password
linking fits next to the existing provider-linking policy.

## Decision

v0.0.12 adds password auth through the Supabase Email provider.

- The app accepts the user's email and password, validates the raw string
  locally (8–72 UTF-8 bytes, no leading/trailing whitespace, forwarded
  unchanged), and forwards it to Supabase `signInWithPassword`, `signUp`, or
  `updateUser` depending on intent.
- New email addresses must be confirmed before the account is considered
  protected. Zona chooses Supabase's built-in 6-digit confirmation code
  mechanism instead of magic links for this flow. The hosted "Confirm signup"
  and "Change Email" templates must include `{{ .Token }}` so the user can read
  the code from the email and enter it in the app.
- Pending-confirmation states route to `/auth/check-email` for
  `sign_up`, `protect_guest`, and `link_method` intents. The screen explains
  that a code was sent, allows resending within a cooldown, and submits the
  entered code to `verifyOtp` with `type: 'signup'` or `'email_change'` as
  appropriate.
- Capability gating reuses the existing email-provider feature flag. Where the
  email provider is hidden or disabled, password entry is also hidden; where
  email is enabled, password is offered alongside the existing OTP/magic-link
  path.
- Password linking inherits the current app-level non-reauthenticated linking
  behavior for identity mutations. The app already requires recent
  reauthentication for transfer, deletion, and session revocation, but direct
  Supabase identity calls can bypass that gate. Password link/unlink and
  password changes use the same app-level proof prompts as other identity
  mutations; a stronger reauth-gated credential change is a named hardening
  follow-up.

## Rationale

- A password is a familiar, device-independent credential that works even when
  the user's mail client is temporarily unavailable.
- Supabase's bcrypt storage and confirmation-code flow keep Zona from
  operating SMTP infrastructure or persisting plaintext secrets.
- Six-digit codes are easier to enter on a phone than long magic-link URLs and
  avoid deep-link routing fragility when the app is terminated or the link is
  opened in the wrong browser.
- Reusing the existing email-provider flag keeps rollout simple: one provider
  toggle controls both OTP/magic-link and password UX.
- Matching the existing identity-mutation policy avoids inconsistent behavior
  between provider and password linking, while documenting the follow-up
  hardening keeps the security owner aware of the residual risk.

## Consequences

Positive:

- users can protect and recover Zona with a single saved credential;
- password-manager users have a natural integration path;
- the same confirmed email identity supports sign-in, recovery, and
  cross-device restore;
- no new backend SMTP or credential-storage code is required.

Costs and risks:

- password reuse, credential stuffing, and brute-force attacks become relevant
  threat classes (see `docs/THREAT_MODEL.md`);
- users may forget passwords or lose access to the confirming email inbox;
- the 72-byte bcrypt cap means very long passwords are silently truncated by
  Supabase unless the client enforces the cap; Zona enforces 8–72 UTF-8 bytes
  before forwarding;
- confirmation emails remain a deliverability dependency;
- password changes that do not require recent reauthentication are a residual
  hardening gap shared with the existing provider-linking flow.

Mitigations:

- client-side validate-only length and whitespace checks (8–72 bytes, no
  leading/trailing whitespace) with exact-byte forwarding;
- non-enumerating responses for sign-in, sign-up, and password-reset flows;
- Supabase rate limits on sign-in attempts and confirmation-code sends;
- security notices and audit events for link/unlink/email-change/password-change
  events;
- password-entry fields support password managers and avoid copying to the
  clipboard;
- the hosted "Confirm signup" and "Change Email" templates include the
  `{{ .Token }}` placeholder and are verified before release.

## Hosted-dashboard verification

Before v0.0.12 ships, confirm on the hosted Supabase project
(`gerncrjtrdjtjvybvseb`) dashboard:

- Authentication → Providers → Email: **Confirm email** is enabled.
- The same panel shows **Minimum password length** set to `8`.
- The "Confirm signup" email template contains `{{ .Token }}`.
- The "Change Email" email template contains `{{ .Token }}`.

These dashboard values, not `supabase/config.toml`, define production policy.
`supabase/config.toml` carries `minimum_password_length = 8` under `[auth]` for
local parity only. Record the observed values below once the operator has
verified them on the hosted project.

| Setting | Observed value |
| --- | --- |
| Confirm email enabled | `REQUIRED` |
| Minimum password length | `REQUIRED` |
| "Confirm signup" template contains `{{ .Token }}` | `REQUIRED` |
| "Change Email" template contains `{{ .Token }}` | `REQUIRED` |

## Alternatives considered

### Magic-link-only email recovery

Rejected for the password path. Magic links work for passwordless email but do
not give users a saved credential; they are kept as the existing OTP/magic-link
path.

### Supabase email OTP instead of 6-digit code

Rejected for the password flow. OTP and 6-digit confirmation are similar, but
Supabase's built-in confirmation-code templates align cleanly with
`signUp`/`updateUser` plus `verifyOtp`, and the same template verifies email
changes.

### Client-side password hashing before sending to Supabase

Rejected. Supabase Auth expects the raw password so it can apply its own
bcrypt work factor and storage; client hashing would break the protocol and not
materially reduce server trust.

### Require recent reauthentication for every password link/change

Deferred. The app-level proof gate is applied consistently with provider
linking, and a future hardening ADR can enforce reauthentication for all
credential mutations without changing the password-auth architecture.

## Revisit triggers

Revisit this decision before adding password reset via SMS, MFA, passkeys, or
a custom credential proxy. Any revisit must preserve bcrypt-only server
storage, confirmation-code templates with `{{ .Token }}`, and the 8–72 byte
client validation boundary.
