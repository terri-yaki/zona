# Zona roadmap to a paid product

Zona should earn trust before it asks for money. The path from v0.0.8 to
v0.0.10 makes accounts recoverable, proves the paid-access plumbing, and then
adds time-saving features that are worth subscribing to. The core promise—an
alert reaches the right phone from the right source—remains useful for free.

## v0.0.8 — Keep your Zona

**User story:** protect a Zona account so changing phones does not mean starting
over.

- Add recoverable sign-in and a clear upgrade path from today's private guest
  account, with email, Apple, Google, and GitHub.
- Let people manage linked sign-in methods and their signed-in phones without
  confusing a phone, a sender key, or a future integration with their account.
- Add phone-to-phone restore for sources, preferences, and recent history.
- Make delivery more dependable with a durable send queue and delivery health
  that distinguishes accepted, sent, and failed alerts.
- Add private usage meters for sources, phones, history, attachments, and alert
  volume; show people what they use before limits are enforced.

Architecture work: stable account identity, resumable ownership transfer,
queued delivery workers, receipt reconciliation, and server-owned usage
counters. Public database access stays explicitly granted and owner-scoped.
The complete account lifecycle and rollout contract is in
[ACCOUNT_MANAGEMENT.md](ACCOUNT_MANAGEMENT.md) and
[ADR 0004](adr/0004-recoverable-accounts-and-principal-separation.md).

## v0.0.9 — Zona Plus beta

**User story:** unlock more room and restore the purchase on any signed-in
phone.

- Offer Zona Plus through Apple and Google in-app purchase flows.
- Include purchase, restore, manage-subscription, grace-period, refund, and
  expiry experiences.
- Verify store events on the backend; the app displays access but never grants
  it to itself.
- Invite a small TestFlight and Android testing group before making the offer
  public.

Architecture work: one entitlement service fed by App Store and Play Store
events, an append-only purchase-event record, idempotent webhook handling, and
support tools that can explain why an account has access.

## v0.0.10 — Make Plus worth keeping

**User story:** spend less time watching systems and more time acting on the
alerts that matter.

- Add source groups and saved inbox views.
- Add quiet schedules with clear exceptions for important alerts.
- Add escalation rules that surface an alert again when it still needs
  attention.
- Polish upgrade, trial, cancellation, privacy, support, and first-run flows
  for a public paid beta.

Architecture work: a small rules engine with allowlisted actions, timezone-safe
schedules, auditable rule execution, and analytics limited to product health
and consented usage.

## Working Free and Plus shape

Exact limits should be tuned from v0.0.8 usage data rather than guesswork.
This is the first product hypothesis:

| Capability | Free | Zona Plus |
| --- | --- | --- |
| Sources | 2 | 10 |
| Phones | 1 | 3 |
| Searchable history | 7 days | 30 days |
| Attachments | Basic allowance | Larger allowance |
| Alert volume | Everyday use | Higher-volume use |
| Saved views and source groups | — | Included |
| Quiet schedules and escalations | — | Included |

Push delivery, account deletion, credential revocation, security protections,
and a usable inbox are never paywalled. Before v1.0.0, monetization is ready
only when purchases restore correctly, store events reconcile, limits fail
gracefully, privacy wording is accurate, and support can diagnose entitlement
problems without seeing notification content.

