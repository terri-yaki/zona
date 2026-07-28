# Zona privacy notice — release draft

Effective date: `REQUIRED_BEFORE_RELEASE`  
Data controller/operator: `REQUIRED_BEFORE_RELEASE`  
Privacy contact: `REQUIRED_BEFORE_RELEASE`  
Hosted policy URL: `REQUIRED_BEFORE_RELEASE`

This draft documents the intended data practices for Zona’s private TestFlight
notification service. It must be reviewed for the operator’s jurisdictions,
completed, hosted publicly, linked inside the app, and matched to App Store
Connect privacy answers before distribution. It is not legal advice.

## What Zona does

Zona lets a signed-in user receive a synchronized seven-day alert inbox from
trusted PCs or local applications. A sender submits an alert to Supabase. Zona
stores the alert and makes one best-effort request through Expo Push Service and
Apple Push Notification service (APNs) to registered iPhones.

## Data processed

| Category | Examples | Purpose |
| --- | --- | --- |
| Account data | Email address, Supabase Auth user ID, session/security events | Sign-in, account isolation, security, support |
| Device data | Random installation ID, Expo push token, platform, registration timestamps | Deliver and manage push notifications |
| Source data | Source UUID, display name, optional hostname, creation/last-activity/revocation time, credential hash | Attribute and independently revoke senders |
| Notification data | Source-name snapshot, title, body, category, JSON metadata, optional evidence image, created/read/expiry time | Store, display, filter, and route alerts |
| Delivery/abuse data | Notification/source/device UUIDs, provider ticket/status/error, request time, rate-limit records | Delivery diagnostics, abuse prevention, reliability |
| Operational data | Function/Auth/database logs, request IDs, error and security events | Operate, secure, diagnose, and improve the service |

The plaintext source credential is shown once to the authenticated user and is
not stored by Zona after its hash is created. The sender/operator may store the
plaintext token in its own OS-backed secret store.

## How data is used

Zona processes data to:

- authenticate the account and enforce per-user/source authorization;
- accept, synchronize, display, filter, mark read, and delete notifications;
- attempt push delivery and diagnose provider failures;
- create, rename, and revoke independent sources;
- prevent abuse through payload and rolling-rate limits;
- maintain security, retention, backup, support, and incident response; and
- comply with applicable legal obligations.

Zona is not designed to sell personal data, serve advertising, or track a user
across other companies’ apps and websites. Any future analytics or change in
purpose requires an updated assessment, notice, consent/Apple declarations as
applicable, and release review.

## Service providers and disclosure

Data is processed by infrastructure needed to provide Zona:

- **Supabase** hosts authentication, Edge Functions, database, realtime, logs,
  and scheduled cleanup.
- **Expo Push Service** receives push tokens and notification payloads to submit
  messages to platform push services.
- **Apple APNs and iOS** deliver and display push notifications.
- **Expo/EAS and Apple Developer/App Store Connect** process build,
  distribution, signing, tester, and operational account data.

Before release, identify the actual providers, operator entity, hosting regions,
data-processing terms, international transfer mechanism, and subprocessors in
the hosted notice. Zona may also disclose data when required by law or necessary
to protect users/service security, subject to applicable requirements.

## Notification-content warning

The title, body, source label, and selected routing metadata are sent through
Supabase, Expo, and APNs. Depending on iOS settings, they may be visible on the
lock screen or to someone with physical access to the device.

Do not submit passwords, API keys, source tokens, personal access tokens, magic
links, or unnecessary sensitive/regulated information as notification content
or metadata. Users control notification previews in iOS Settings. A future
redacted-push option would require a product/privacy update.

## Retention

| Data | Intended retention |
| --- | --- |
| Notifications, evidence images, and associated push-delivery diagnostics | Seven days from acceptance, then automated deletion |
| Per-source rate-limit request rows | One day |
| Active sources and credential hashes | Until source/account deletion |
| Revoked source records and hashes | Until account deletion or an approved documented archival purge |
| Push registration | Until that installation is deregistered, the account is deleted, or an invalid-token lifecycle removes it |
| Account | Until account deletion, subject to documented legal/provider retention |
| Provider security, Auth, backup, and platform logs | Provider/operator schedule that must be completed before release |

Backups and restored copies require a documented expiration process. If law
requires longer retention, the final notice must identify the category, basis,
and period rather than silently overriding this table.

## User choices and rights

Users can choose not to grant iOS notification permission and still use the
synchronized inbox. They can rename/revoke a source, mark/delete individual
notifications, deregister the current installation through safe sign-out, and
control lock-screen previews in iOS Settings.

Before release, Zona must provide an easy-to-find in-app method to initiate full
account deletion. It must delete the Supabase Auth account and owned sources,
credential hashes, push registrations, notifications, and delivery data that
the operator is not legally required to retain. Until implemented and verified,
external distribution is blocked.

The final notice must explain how to request access, correction, deletion,
restriction, portability, or objection where applicable, how identity is
verified, response timing, and the right to contact the relevant regulator.
Insert a direct privacy contact and, if completion occurs on the web, a direct
link to that exact account-deletion page.

## Security

Zona uses TLS, Supabase Auth, row-level security, per-source opaque credentials,
hash-only source credential storage, payload/rate limits, independent
revocation, and bounded retention. No system is perfectly secure. Report issues
through [SECURITY.md](SECURITY.md); do not email live credentials or real alert
content.

## Children

Zona is not directed to children. Before broader distribution, the operator
must select an appropriate age rating and determine whether additional age or
parental-consent obligations apply.

## Changes

Material changes to collected data, purpose, providers, retention, or user
rights require a revised notice, App Store privacy update, product/security
review, and user notice or consent when required. The effective date above must
be updated.

## App Store privacy inventory

The release owner must map the actual implementation and provider practices to
Apple’s current privacy questionnaire. At minimum, review identifiers, contact
information, user content, diagnostics, and product interaction data; determine
whether each is linked to the user and its purpose. Do not copy this inventory
mechanically into App Store Connect without verifying Apple’s current definitions.

## Contact

Questions and privacy requests: `REQUIRED_BEFORE_RELEASE`. The contact must be
monitored and linked from the app and hosted policy.

