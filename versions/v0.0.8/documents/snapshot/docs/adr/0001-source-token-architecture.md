# ADR 0001: Direct per-source credentials replace the Windows companion

- Status: Accepted for version 1
- Date: 2026-07-20
- Owners: Product and engineering owner to be assigned before release

## Context

The initial design paired each Windows PC through a short-lived QR/manual code,
installed a .NET 8 tray companion, stored a device credential in Windows
Credential Manager, and exposed a loopback-only notification endpoint. The
companion would have been responsible for identifying the PC and forwarding
local alerts.

The product direction changed: an existing local application can already send
HTTP requests and should post notifications without installing another Windows
process. Maintaining a native companion, installer, tray lifecycle, local API,
and pairing protocol would add material operational scope before validating the
notification inbox.

## Decision

Version 1 uses one independent source record and opaque Bearer credential per
trusted PC or local application.

- The signed-in iPhone app creates and names a source.
- The server generates `zona_live_…`, stores only its SHA-256 hash, and returns
  the credential once.
- The operator transfers it to an OS-backed sender secret store.
- The sender calls the hosted `/functions/v1/notify` endpoint directly.
- The backend derives source/owner identity from the credential hash. The
  payload has no source selector.
- Rename retains the permanent source UUID; notification rows retain a
  source-name snapshot.
- Revoke affects only that source and is immediately enforced at ingestion.

The following original deliverables and tests are retired:

- .NET/Windows tray companion and installer;
- loopback-only `/v1/notifications` listener;
- QR/manual pairing codes, expiry, single-use checks, and reuse tests;
- companion heartbeat and authoritative online status;
- Windows Credential Manager integration owned by Zona.

Sender applications may still use Windows Credential Manager, but that is an
integration responsibility documented by the API rather than a shipped Zona
binary.

## Rationale

- It removes an entire native deployment and update surface.
- It supports non-.NET applications and automation immediately.
- Independent credentials preserve least privilege and per-source revocation.
- Server-derived identity prevents caller source-name spoofing.
- The decision keeps version 1 focused on reliable notification ingestion,
  synchronization, and iOS delivery.

## Consequences

Positive:

- fewer components, installers, and local failure modes;
- language-independent sender integration;
- practical multi-PC support using the same API contract;
- source compromise is contained to one independently revocable credential.

Costs and risks:

- there is no cryptographic binding between a credential and physical hardware;
- the user must transfer and securely store a long-lived secret;
- source setup is not currently a camera/QR experience;
- there is no companion heartbeat, so “online” cannot be asserted;
- rotation requires replacement-source creation and old-source revocation;
- sender retry/idempotency behavior is not centrally managed.

Mitigations:

- show the token once with explicit storage warnings and no-store responses;
- hash credentials server-side and never log them;
- make revocation immediate and easy to find;
- provide PowerShell, Node.js, and cURL integration examples;
- document bounded retry behavior and client event IDs;
- add a future credential-rotation design only after threat-model review.

## Alternatives considered

### Retain the .NET companion

Rejected for version 1 because installer, lifecycle, signing, local transport,
credential storage, and Windows-specific support exceed the value needed for
notification-only validation.

### Let senders insert directly into Postgres

Rejected. Giving a local app a user session or service credential would weaken
source isolation and expose database interfaces. The Edge Function remains the
only sender trust boundary.

### Shared account API key

Rejected. A compromise would affect every source, attribution would be
caller-controlled, and independent revocation would be impossible.

### Short-lived pairing followed by a device credential

Deferred. It offers a smoother installation experience but still needs a
managed local agent or integration protocol. It can be reconsidered through a
new ADR without changing stable source UUID semantics.

## Compatibility and migration

There is no deployed .NET credential population to migrate. Existing source
UUIDs and credentials remain valid until explicitly revoked. A future managed
companion may authenticate as a normal source, but pairing must never reveal or
reuse another source’s credential.

### v0.0.8 source-key amendment

The shipping v0.0.7 app deviated from this ADR's issuance description: it
generates and hashes the token on-device, then calls an owner RPC. v0.0.8 makes
server-generated issuance through the authenticated Edge API canonical again.
The response returns plaintext once with `Cache-Control: no-store`; only the
hash is stored. The client-generated-hash RPC remains temporarily for old app
builds and is not used by new clients or integrations.

v0.0.8 also changes source-to-key cardinality to one-to-many so a replacement
key can overlap with an old key on the same permanent source. Source display
identity and sound are not access-key properties. Existing keys are backfilled
without changing their plaintext validity. The proposed schema and rollout are
specified in [ACCOUNT_MANAGEMENT.md](../ACCOUNT_MANAGEMENT.md); OpenAPI and
Architecture must change in the same implementation commit.

## Revisit triggers

Reconsider this decision if secure token transfer becomes the dominant support
issue, hardware binding is required, offline command delivery enters scope, or
source presence becomes a product requirement. Any revisit must preserve
independent revocation and prohibit arbitrary remote shell execution.
