# Zona roadmap to a paid product

Zona should earn trust before it asks for money. The path from v0.0.8 to
v0.0.10 makes accounts recoverable, proves the paid-access plumbing, and gives
the product a safe control surface before paid features arrive. The core promise—an
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

## v0.0.9 — Trust and visibility

**User story:** understand how much Zona is doing and whether an alert reached
the phone service, without opening a developer console.

- Show account usage for sources, active keys, phones, retained alerts,
  attachments, and recent alert volume.
- Show a clear delivery state on each notification while staying honest that a
  push-service receipt does not prove the person saw the alert.
- Add automated database, RLS, migration, and Edge Function contract gates to
  every pull request.
- Complete a physical-iPhone TestFlight matrix before release.

Architecture work: an owner-scoped delivery summary over the private queue,
sanitized failure reasons, usage presentation over the existing server-owned
counters, and a disposable local Supabase stack in CI. Passkeys, MFA, and
protected-account merge remain outside this release.

## v0.0.10 — Control Room

**User story:** keep the important signal close, quiet the noise on my terms,
and understand whether each source and phone delivery path is healthy.

- Search alert content and source identity, save common views, pin work, return
  an alert to unread, and group repeated messages without losing history.
- Add account quiet hours and per-source schedules that suppress only pushes,
  never accepted inbox records.
- Show source activity and recent aggregate delivery health.
- Add a guided first-alert path with agent and automation templates.
- Add an iOS inbox widget and native Shortcuts actions.
- Add App Status diagnostics covering version/build, OS, configuration
  freshness, push registration, feature counts, tier, and a generated ID.
- Keep the useful manual OTA check, remove the duplicate foreground watcher,
  and reserve store releases for native/runtime changes.

Architecture work: owner-scoped RPCs keep saved filters, schedules, pin state,
search, and health aggregates behind session checks. Push suppression is a
server decision after durable inbox insertion. Native extensions receive only
bounded presentation props, while client controls never grant permissions.

## v0.0.11 — Zona Plus beta

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

