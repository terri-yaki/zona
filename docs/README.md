# Zona documentation

This directory describes the current Zona product and its operating procedures.
Start here instead of searching `versions/`, which contains immutable historical
snapshots that may describe behavior retired by later releases.

## Current product

| Document | Purpose | Authority |
| --- | --- | --- |
| [Feature status](FEATURE_STATUS.md) | What users can do in the current binary, what is conditional, and what is not implemented | First stop for feature availability |
| [Product requirements](PRD.md) | Product behavior, safety requirements, and acceptance evidence | Product contract |
| [Architecture](ARCHITECTURE.md) | Components, data flow, trust boundaries, and reliability model | Design contract |
| [Notification API](API.md) | Human-readable sender guide and examples | Sender guide |
| [OpenAPI](openapi.yaml) | Machine-readable HTTP/RPC request and response contract | API shape |
| [Account management](ACCOUNT_MANAGEMENT.md) | Guest, protected-account, installation, transfer, and deletion behavior | Account design |
| [Runtime controls](RUNTIME_CONTROLS.md) | Operator-controlled presentation and service switches | Control contract |

When wording conflicts, executable behavior and database authorization win. For
HTTP shapes, `openapi.yaml` and the Edge Function contract tests must agree. For
database behavior, applied migrations plus database tests are authoritative.
Fix the prose in the same change instead of preserving a known contradiction.

## Build, test, and operate

| Document | Use it for |
| --- | --- |
| [Test plan](TEST_PLAN.md) | Automated gates and physical-device evidence |
| [Release procedure](RELEASE.md) | Backend rollout, EAS build, TestFlight, and rollback |
| [Database migrations](DB_MIGRATIONS.md) | Forward-only migration workflow and production checks |
| [Production runbook](RUNBOOK.md) | Diagnosis, incidents, backup, and recovery |
| [Observability](OBSERVABILITY.md) | Private telemetry and the developer-only daily report |
| [Preview updates](PREVIEW_UPDATES.md) | Preview OTA versus native builds |
| [Android push](ANDROID_PUSH.md) | Android transport setup |
| [Live Status](LIVE_ACTIVITY.md) | iOS Live Activity behavior and limitations |
| [Widgets and Shortcuts](IOS_WIDGETS_SHORTCUTS.md) | iOS extensions and release checks |
| [Threat model](THREAT_MODEL.md) | Security boundaries, abuse cases, and residual risks |

## Product direction and communication

| Document | Status |
| --- | --- |
| [Roadmap](ROADMAP.md) | Forward-looking product direction; not a promise that every item is enabled |
| [Public launch plan](PUBLIC_LAUNCH_PLAN.md) | Proposal for monetization and public operations |
| [Branding](BRANDING.md) | Zona Notify store brand and Zona in-app naming |
| [App changelog guide](APP_CHANGELOG.md) | Database-backed What's New publishing model |
| [Changelog writing](CHANGELOG_WRITING.md) | Customer-first writing rules |
| [v0.0.9 plan](V0_0_9_PLAN.md) | Completed release plan and evidence checklist |
| [v0.0.10 plan](V0_0_10_PLAN.md) | Completed release plan and rollout order |
| [v0.0.10 UI audit](V0_0_10_UI_AUDIT.md) | Dated design audit; remaining checks are evidence, not missing code |

## Historical releases

`../versions/` contains cumulative database packages, documentation snapshots,
release copy, and checksums through v0.0.8. Those files are evidence of what a
release boundary contained, not current setup instructions. Do not edit an
archive to correct current behavior; update the live documents above and create
a new archive for the next release boundary.

## Documentation workflow

1. Change code, migration, API contract, and user wording together.
2. Update [Feature status](FEATURE_STATUS.md) when availability or limitations
   change.
3. Update `CHANGELOG.md` for the release and use benefit-led copy for the
   database-backed What's New entry.
4. Run `node scripts/check-documentation.mjs` from the repository root.
5. Keep plans and dated audits explicit about whether an item is proposed,
   implemented, enabled, verified on hardware, or published to users.

