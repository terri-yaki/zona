# ADR 0002: Anonymous sign-in replaces email magic links

- Status: Superseded for account recovery by ADR 0004; guest start remains accepted
- Date: 2026-07-20
- Owners: Product and engineering owner to be assigned before release

## Context

> v0.0.8 keeps anonymous guest start but replaces this ADR's no-recovery
> decision with [ADR 0004](0004-recoverable-accounts-and-principal-separation.md).

Zona is a private, single-owner application. Email magic-link authentication
required a production SMTP provider, and the hosted built-in email service
rate-limited sign-in attempts tightly enough to block ordinary testing. For a
single owner there is no account-recovery or multi-user requirement that
justifies collecting an email address.

## Decision

The iPhone app signs in with Supabase Auth anonymous sign-in
(`signInAnonymously`). No email, password, or SMTP provider is required.

- The account is created on first use and is tied to the installation's stored
  session.
- Row-level security, source ownership, push registration, and account
  deletion are unchanged: they key off `auth.users.id` regardless of how the
  user authenticated.
- Signing out an anonymous account is permanent data loss from the app's
  perspective, so Settings confirms this explicitly before signing out.
- The email deep-link flow (`auth/callback` route, callback parsing, PKCE link
  exchange) was removed entirely; linking an email identity later would
  reintroduce it through a new ADR.

## Rationale

- Removes the SMTP dependency and its cost, deliverability, and rate-limit
  failure modes from the critical path.
- Collects less personal data; there is no email address to store or protect.
- Keeps version 1 focused on notification ingestion and delivery for one owner.

## Consequences

Positive:

- zero-friction first launch and no email infrastructure to operate;
- smaller privacy surface and simpler App Store privacy answers;
- no magic-link interception, redirect, or SMTP compromise class.

Costs and risks:

- losing the stored session (app deletion, wiped device, sign-out) orphans the
  account: sources, one-time tokens, and history become unreachable;
- anyone holding the device session acts as the owner, so device access equals
  account access;
- abuse controls that relied on per-email identity no longer apply, so
  anonymous sign-in must stay rate-limited provider-side.

Mitigations:

- warn before signing out an anonymous account in Settings;
- document that deleting the app or signing out strands existing sources, and
  that sources must be recreated afterward;
- keep the per-source and per-account ingestion limits as the primary abuse
  control;
- offer an upgrade path later by linking an email identity to the anonymous
  user through a new ADR.

## Alternatives considered

### Keep magic links with a production SMTP provider

Rejected for version 1. It adds an external dependency, cost, and a deliverability
failure mode to authenticate exactly one person, and it remains available as the
documented upgrade path.

### Email and password for a single owner

Rejected. It reintroduces a stored shared secret and a sign-in step without
improving recovery for a single private installation.

## Revisit triggers

Reconsider if a second user ever needs access, if account recovery becomes a
requirement, or if App Store review requires a named-account flow. Any revisit
must preserve the existing `auth.users.id` ownership model so RLS and source
records migrate without schema change.
