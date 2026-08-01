# ADR 0004: Recoverable accounts and separate security principals

- Status: Accepted — implemented in v0.0.8
- Date: 2026-07-29
- Owners: Product and engineering owner to be assigned before implementation
- Supersedes: the recovery decision in ADR 0002; guest start remains supported

## Context

ADR 0002 chose anonymous Supabase Auth for a fast private version. That kept
version 1 simple, but deleting the app, losing the phone, or signing out can
orphan sources, settings, and history. Zona is also preparing subscriptions,
multiple phones, third-party integrations, and possibly teams. Treating one
authentication method, one human, one data owner, one installation, and one
sender as the same principal would make recovery and future authorization
unsafe.

The deployed schema currently keys resources directly to `auth.users.id`.
Supabase supports linking a verified identity to an anonymous user, which can
preserve that ID for the common upgrade path. A provider identity may already
belong to another Zona user, so a safe design also needs explicit conflict and
transfer behavior.

## Decision

v0.0.8 retains guest start and adds passwordless email, Apple, Google, and
GitHub as recoverable sign-in methods.

- A guest is protected by linking a new identity to the current Auth user.
  Success requires the Auth user ID to remain unchanged.
- A signed-out protected user can restore the same account on another phone.
- An identity already belonging to another Zona user never triggers an
  automatic merge. A guest transfer requires proof of both sessions, a preview,
  final confirmation, and an idempotent staged workflow containing one short,
  deferred-constraint database transaction; Storage work never holds that
  transaction open.
- Two protected accounts cannot self-merge in v0.0.8.
- Users may link several methods but cannot unlink their final verified
  recovery method.
- Zona-controlled installation, transfer, export, and deletion actions require
  server-verified recent reauthentication and produce redacted audit events.
  Identity-linking UI applies the same policy as defense in depth, but Supabase
  public identity APIs remain callable by a valid session.

Zona introduces a separate personal account/membership layer additively. The
personal account is the long-term resource and billing boundary; Supabase Auth
users/identities are human authentication; app installations are session/push
endpoints; sources are notification-only machine principals; integrations are
future scoped external-service grants. Credentials are never interchangeable.

Existing resource `user_id` columns and RLS remain authoritative during
v0.0.8 compatibility. One personal account and owner membership are backfilled
per existing Auth user, with `account_id` initially equal to the user's UUID but
without an account-to-user foreign key. Resource-level `account_id` migration
happens only as needed through additive columns, parity checks, dual-write, and
a later cutover after old clients are retired.

The complete lifecycle, schema, UI, security, rollout, and test contract is in
[ACCOUNT_MANAGEMENT.md](../ACCOUNT_MANAGEMENT.md).

## Consequences

Positive:

- users can recover Zona without recreating sources;
- the normal guest upgrade does not move owned rows or invalidate source keys;
- multiple provider methods reduce lockout risk;
- explicit account/install/source/integration boundaries support future paid,
  team, and agent-oriented features; and
- additive rollout protects current clients and ingestion.

Costs and risks:

- provider configuration, email delivery, deep links, and callback state become
  production dependencies;
- manual identity linking must be guarded against wrong-intent and account
  conflict cases;
- guest transfer is a high-risk multi-resource workflow, especially for
  attachments, push-token conflicts, limits, and partial failure;
- the compatibility period temporarily carries both user and account concepts;
  and
- provider availability can temporarily block new sign-in even while active
  sessions continue working.

Mitigations:

- authorization-code/PKCE flows, exact redirect allowlists, state/nonce,
  single-use auth transactions, server-verified recent reauthentication for
  Zona-owned mutations, and app-level recent proof for identity mutations;
- no silent merge and no v0.0.8 protected-account merge;
- idempotent transfer/deletion jobs with advisory locking and redacted audit;
- feature flags per provider with guest fallback and additive database changes;
- RLS and Edge Function tests for guest, two users, revoked/expired sessions,
  source tokens, and service role; and
- operational monitoring by provider and app version without logging tokens,
  callback URLs, email addresses, or notification content.

## Alternatives considered

### Replace guests with mandatory email

Rejected. It adds friction before the user has seen Zona's value and forces
email delivery into first launch. Guest-first plus later protection preserves
the current experience.

### Sign in normally, then reassign guest rows in the client

Rejected. Switching Auth users before protecting guest ownership can strand
data, and client-side row reassignment is vulnerable to cross-account access
and partial failure.

### Keep `auth.users.id` as the permanent account abstraction forever

Rejected as a long-term model. It cannot cleanly represent team membership,
independent billing ownership, installations, or external integrations. The
account layer is additive so v0.0.8 does not need a risky resource rewrite.

### Automatically merge provider accounts with the same email

Rejected. Provider email equality is not sufficient proof that two existing
Zona data sets should be combined, and merge decisions for sources, purchases,
preferences, and history are not reversible.

### Use source API keys for integrations or human sign-in

Rejected. Source keys are deliberately notification-only and independently
revocable. Reuse would expand compromise impact and obscure audit identity.

## Revisit triggers

Create another ADR before enabling protected-account merge, team membership,
public Zona OAuth clients, SAML/enterprise organizations, or remote PC
commands. Any future command model must target a specific source and expose
only allowlisted actions—never arbitrary shell input.
