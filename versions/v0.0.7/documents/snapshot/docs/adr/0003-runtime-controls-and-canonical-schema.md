# ADR 0003: Typed runtime controls and staged canonical schema names

- Status: Accepted for v0.0.6
- Date: 2026-07-28
- Owners: Product and engineering owner to be assigned before broader release

## Context

Zona needs to change safe presentation behavior, quotas, maintenance state, and
release content without waiting for App Store review. The previous
`universal_app_options` table was an untyped string key/value store readable by
every authenticated client, and `app_changelog.items` kept every card inside a
single JSON array. Neither model gave each control an independent lifecycle or
made the trust boundary clear.

Several original table names also became ambiguous as the product expanded.
Physically renaming every table in one deployment would break the installed
v0.0.5 client: it directly upserts preferences and subscribes to legacy table
names over Postgres Realtime.

## Decision

Zona separates client presentation controls from server enforcement:

- `private.app_feature_controls` evaluates allowlisted feature modes;
- `private.app_runtime_settings` stores typed display values;
- `private.client_release_policies` controls update and maintenance messaging;
- `private.app_announcements` publishes localized, scheduled banners;
- `private.service_switches` and `private.service_plan_limits` are enforced by
  Edge Functions and security-definer database functions;
- `private.account_entitlements` owns plan state separately from user-writable
  notification preferences; and
- `public.app_release_notes` plus `public.app_release_note_items` normalize
  release content so every item has its own `is_active`, order, schedule, and
  platform target.

The app receives one evaluated `get_app_bootstrap` response. The server derives
the account tier, applies activation windows and targeting, and uses a stable
installation identifier only for deterministic presentation rollouts. The app
ignores unknown keys and ships safe defaults. No runtime value may define code,
SQL, arbitrary routes, request destinations, credentials, or authorization.

Canonical relation names are introduced in two stages. v0.0.6 reads
security-invoker views and mutates data through owner-checked RPCs. User-scoped
Realtime Broadcast topics remove physical table names from subscriptions. Once
release policy retires v0.0.5, a later migration may rename the remaining base
tables while preserving the canonical view/RPC contracts. The read-only
changelog is renamed immediately because a compatibility view safely preserves
the old query.

## Consequences

Positive:

- operational changes are typed, scheduled, targeted, reversible, and auditable;
- hiding a button is no longer confused with enforcing a security decision;
- limits and kill switches apply immediately even when a client cache is stale;
- release cards can be published or withdrawn independently; and
- mobile code no longer depends on legacy physical names or table-based
  Realtime subscriptions.

Costs and risks:

- the compatibility period temporarily has both legacy and canonical names;
- operators must understand priority, specificity, windows, and rollout rules;
- stale clients can take up to the bootstrap TTL to reflect presentation
  changes; and
- the later physical cutover requires adoption evidence and a forward migration.

Mitigations:

- document the complete operator model in `docs/RUNTIME_CONTROLS.md`;
- keep security-sensitive switches private and fail closed;
- keep Privacy, sign-out, account deletion, and source revocation outside the
  feature allowlist;
- test cross-account RPCs, rollout determinism, cache fallback, compatibility
  views, and Broadcast authorization; and
- use client release policy/build telemetry before the physical rename.

## Alternatives considered

### Expand the universal string key/value table

Rejected. It has no per-domain type safety, weak trust-boundary signaling, and
encourages client code to interpret arbitrary values.

### Put every control in the public schema

Rejected. Authenticated clients need only an evaluated snapshot. Raw service
switches, entitlements, and quotas expose unnecessary operational state and are
too easy to mistake for client-authoritative decisions.

### Rename all physical tables immediately

Rejected during the v0.0.5 compatibility window. Direct upserts on views and
table-name-based Realtime subscriptions are not safely backward compatible.

## Revisit triggers

Revisit when v0.0.5 is below the approved support threshold, when an operator UI
replaces reviewed SQL/migrations, or when a control needs to authorize a new
capability. Authorization changes require a separate threat review rather than
an additional feature key.
