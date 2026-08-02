# v0.0.10 — Control Room

## Product promise

Zona should feel ready for the user and adjustable for the operator. This
release closes both sides of that promise: users can find a sender, carry an
alert into another app, and understand Zona's current status; the operator can
tune supported presentation safely without shipping a new binary.

## Release features

1. **Source search** — search source name, hostname, access-key label, or safe
   prefix from one field. It appears only when the source list is large enough
   to benefit.
2. **Copy and share** — notification details produce a useful plain-text
   summary while intentionally excluding JSON metadata, internal IDs,
   credentials, attachment paths, and signed URLs.
3. **App Status** — one screen explains configuration freshness, available or
   adjusted features, account capacity, app version/platform, and support.
4. **Control catalog** — 69 compiled runtime feature controls and 17 typed settings are
   privately documented with defaults, safe bounds, allowed values, and active
   rule/override counts.
5. **UI quality pass** — readable badges, larger touch targets, responsive
   source actions, conditional settings dividers, and a cleaner sign-in screen.
6. **Inbox productivity** — search alert content, save views, pin work, return
   alerts to unread, and group repeated messages without losing history.
7. **Focus and delivery clarity** — account quiet hours, per-source schedules,
   source activity summaries, and honest provider-acceptance status.
8. **First-alert path and iOS surfaces** — guided sender examples, an inbox
   widget whose snapshot updates obey its runtime control, and build-time Apple
   Shortcuts actions.

## Safety contract

- Remote controls affect presentation only; server permissions, RLS, quotas,
  ownership, and credential checks remain authoritative.
- Privacy, sign-out, account deletion, source revocation, and key revocation
  cannot be hidden by the catalog.
- Unknown keys are ignored by old clients and safe compiled defaults are used
  when bootstrap is unavailable.
- Operator metadata stays in the `private` schema. Mobile clients receive only
  their localized, targeted, evaluated bootstrap snapshot.
- Release notes remain unpublished until physical-device and store evidence is
  complete.

## Delivery order

1. Apply additive database migrations and verify grants/catalog integrity.
2. Ship the v0.0.10 binary with the expanded allowlist and new screens.
3. Verify iOS and Android physical-device behavior, including copy/share and
   large text.
4. Activate the v0.0.10 release note after store submission evidence exists.

Zona Plus moves to v0.0.11 so monetization is built on an observable,
operator-controlled foundation rather than competing with this release.
