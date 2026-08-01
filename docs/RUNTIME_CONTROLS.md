# Runtime controls operator guide

Zona v0.0.6 introduced safe app behavior controls from Supabase; v0.0.10
expands and catalogs them. Controls are evaluated by `public.get_app_bootstrap(...)`, cached
on the device, and refreshed in the background. Security decisions remain in
RLS, database functions, and Edge Functions.

## Control boundaries

The model deliberately separates presentation from enforcement:

| Table | Purpose | Client access |
| --- | --- | --- |
| `private.app_control_catalog` | Operator labels, descriptions, types, defaults, safe bounds, and supported values for every compiled control | Service role only; never sent directly to clients |
| `private.app_feature_controls` | Show, hide, disable, or make an allowlisted UI feature read-only | Evaluated through bootstrap only |
| `private.app_runtime_settings` | Typed display values such as guide URL, page size, and timing windows | Evaluated through bootstrap only |
| `private.service_switches` | Fail-closed server kill switches for ingestion, source creation, tests, push, attachments, and critical severity | Service code only |
| `private.service_plan_limits` | Typed standard/premium quotas and retention | Service code; resolved values returned by bootstrap |
| `private.account_entitlements` | Server-owned plan/subscription state | Service code only |
| `private.client_release_policies` | Per-platform/channel maintenance and update policy | Evaluated through bootstrap only |
| `private.app_announcements` | Localized in-app banners with optional safe HTTPS action | Evaluated through bootstrap only |
| `public.app_release_notes` | Published releases | Authenticated read of active rows |
| `public.app_release_note_items` | Independently active, ordered, scheduled, platform-targeted release cards | Authenticated read of active rows |

Do not use client controls to authorize data. A hidden button does not replace
RLS or a server check. Zona never allows remote config to hide Privacy, sign
out, account deletion, or source revocation, and it cannot define arbitrary
routes, JavaScript, shell commands, sounds, SQL, or request destinations.

## Feature modes

`private.app_feature_controls.mode` accepts:

| Mode | App behavior |
| --- | --- |
| `enabled` | Visible and interactive |
| `disabled` | Visible but non-interactive; `reason_en` / `reason_zh_hant` may explain why |
| `hidden` | Not rendered |
| `read_only` | Reserved for features with a distinct read-only presentation; current consumers treat it as non-interactive |

Every rule also has `is_active`. An inactive row is ignored, which makes it
safe to draft a rule before publishing it.

### Current feature keys

| Area | Keys |
| --- | --- |
| Inbox | `inbox.summary`, `inbox.filters`, `inbox.source_filter`, `inbox.unread_filter`, `inbox.time_filter`, `inbox.mark_all_read`, `inbox.show_revoked_filters`, `inbox.pull_to_refresh`, `inbox.pagination`, `inbox.category_badges`, `inbox.attachment_badges`, `inbox.relative_time` |
| Notification detail | `notification.attachments`, `notification.category`, `notification.metadata`, `notification.severity`, `notification.delivery_status`, `notification.copy`, `notification.share`, `notification.absolute_time` |
| Sources | `sources.create`, `sources.search`, `sources.pull_to_refresh`, `sources.status_badges`, `sources.hostname`, `sources.last_seen`, `sources.rename`, `sources.pause`, `sources.test`, `sources.sound` |
| Source keys | `source_keys.create`, `source_keys.rename`, `source_keys.pull_to_refresh` |
| Settings/account | `settings.account_summary`, `settings.delivery_status`, `settings.push`, `settings.push_registration`, `settings.sound`, `settings.preview`, `settings.live_activity`, `settings.language`, `settings.theme`, `settings.whats_new`, `settings.manual_update`, `settings.user_guide`, `settings.offline_cache`, `settings.app_status`, `account.usage` |
| App Status | `status.control_summary`, `status.plan_limits`, `status.configuration_details`, `status.support_link` |
| Onboarding/background | `onboarding.push`, `background.live_activity`, `background.ota_updates`, `background.push_registration`, `background.client_telemetry` |

Source revocation and the Privacy/account controls are intentionally absent.

### Typed setting catalog

The v0.0.10 catalog documents 17 settings. They cover safe HTTPS help links,
bootstrap refresh timing, inbox page/filter/card presentation, source online,
search and spacing behavior, delivery polling, short-lived attachment links,
App Status freshness and diagnostic detail, and the allowlisted `comfortable`
or `compact` density preset. Numeric values include operator-visible minimum
and maximum bounds. The client also clamps every value, so a mistaken override
degrades to a safe range.

Query the private dashboard with a service-role SQL session:

```sql
select control_key, control_kind, operator_label, default_value,
       active_rule_count, active_override_count
from private.app_control_dashboard
order by category, sort_order, control_key;
```

The dashboard is inventory, not the client API. Add an override to
`private.app_feature_controls` or `private.app_runtime_settings`; do not edit a
mobile app to read the dashboard and do not expose the `private` schema.

## Targeting and precedence

Feature and setting rules may target:

- platform: `ios`, `android`, or `web`;
- release channel: `production`, `preview`, or `development`;
- locale: `en` or `zh-Hant`;
- server-derived account tier: `standard` or `premium`;
- minimum/maximum native build number;
- activation window (`starts_at`, `expires_at`);
- deterministic rollout from 0–10,000 basis points;
- explicit integer priority.

Multiple rows may use the same key. Zona resolves the highest priority, then
the most specifically targeted, then the most recently updated row, with the
UUID as a deterministic tie-break. This permits a current rule and a future
scheduled replacement to coexist.

Rollouts hash the stable installation ID with `rollout_seed`. They are useful
for presentation and compatibility—not entitlements or authorization.

## Common operations

Run changes in the Supabase SQL editor or through a reviewed migration.

Hide source creation immediately:

```sql
insert into private.app_feature_controls (
  feature_key, mode, reason_en, reason_zh_hant, priority
) values (
  'sources.create',
  'hidden',
  'New source creation is temporarily unavailable.',
  '暫時無法建立新來源。',
  100
);
```

Disable test notifications on production iOS only:

```sql
insert into private.app_feature_controls (
  feature_key, mode, platform, release_channel,
  reason_en, reason_zh_hant, priority
) values (
  'sources.test', 'disabled', 'ios', 'production',
  'Test alerts are paused while delivery is checked.',
  '正在檢查推送服務，測試通知暫時停用。',
  100
);
```

Schedule a 25% rollout:

```sql
insert into private.app_feature_controls (
  feature_key, mode, rollout_basis_points, rollout_seed,
  starts_at, expires_at, priority
) values (
  'notification.metadata', 'enabled', 2500, 'metadata-july',
  '2026-07-30T00:00:00Z', '2026-08-06T00:00:00Z', 50
);
```

Deactivate a rule without deleting its audit trail:

```sql
update private.app_feature_controls
set is_active = false
where id = 'RULE_UUID';
```

Change a typed runtime setting by adding a higher-priority row:

```sql
insert into private.app_runtime_settings (
  setting_key, value_type, value, description, priority
) values (
  'inbox.page_size', 'number', '50'::jsonb,
  'Load fifty inbox rows per page', 100
);
```

Valid runtime value types are `boolean`, `number`, `string`, and `json`; a
database check rejects a mismatched JSON value.

Pause notification ingestion at the server:

```sql
insert into private.service_switches (
  switch_key, is_enabled, operator_reason, priority
) values (
  'api.v1.notifications.accept', false,
  'Emergency maintenance', 100
);
```

Unlike a hidden UI control, this switch is enforced by the Edge Function and
the database wrapper. The API returns `503 SERVICE_UNAVAILABLE` with
`Retry-After: 60`.

Publish an announcement:

```sql
insert into private.app_announcements (
  announcement_key,
  title_en, title_zh_hant,
  body_en, body_zh_hant,
  tone, is_active, starts_at, expires_at
) values (
  'planned-maintenance-july',
  'A short maintenance window', '短暫維護通知',
  'Sending may pause briefly tonight.', '今晚傳送功能可能會短暫暫停。',
  'warning', true,
  '2026-07-30T10:00:00Z', '2026-07-30T14:00:00Z'
);
```

### Release and maintenance policy

`private.client_release_policies` is selected by platform/channel, then by
priority and recency. Its update modes are deliberately bounded:

| Mode | When shown | Behavior |
| --- | --- | --- |
| `none` | Never | Build numbers remain observability metadata only |
| `soft` | Installed build is below `recommended_build_number` | Non-critical update banner |
| `hard` | Installed build is below `minimum_build_number` | Non-dismissible critical update banner |

Even `hard` does not remotely execute code or hide Privacy, sign-out, account
deletion, or source revocation. It keeps those recovery controls reachable.
`maintenance_mode` takes visual priority and may use a localized message and
HTTPS store/status URL.

Stage a soft iOS update prompt without changing the existing row:

```sql
insert into private.client_release_policies (
  platform, release_channel,
  minimum_build_number, recommended_build_number, latest_build_number,
  update_mode, message_en, message_zh_hant, store_url, priority
) values (
  'ios', 'production', 14, 15, 15,
  'soft', 'A small Zona update is ready.', 'Zona 有小更新可供下載。',
  'https://apps.apple.com/app/id6794387261', 100
);
```

Use a new `announcement_key` when a previously dismissed notice must appear
again. Reusing the same announcement ID preserves the user's dismissal.

## Service switches

| Key | Enforcement |
| --- | --- |
| `api.v1.notifications.accept` | Edge precheck and database ingestion wrapper |
| `sources.create` | Database source-creation wrapper |
| `sources.test` | Database test-notification wrapper |
| `push.deliver` | `notify` and `test-source` skip Expo delivery; durable inbox insert remains |
| `notifications.attachments` | Edge multipart validation and database attachment wrapper |
| `notifications.critical_severity` | Edge validation and severity-aware database wrapper |

If the active switch lookup is missing or fails, trusted paths fail closed.

## Typed plan limits

Each active `private.service_plan_limits` row contains all quotas for one plan:

- maximum active source keys;
- inbox retention days;
- per-account and per-source accepted notifications/minute;
- maximum image bytes;
- maximum active push registrations.

The current live values are migrated at deployment time, rather than copied
from stale source-code constants. Schedule a replacement by inserting another
row with a later window or higher priority; do not overwrite history unless
correcting a mistake.

## Caching and failure behavior

The app loads the last successful snapshot from AsyncStorage immediately,
deduplicates concurrent refreshes, then revalidates. Database triggers send a
private `zona:config` invalidation for global changes and a user-scoped
`zona:config:<user-id>` invalidation for entitlement changes, so an online app
normally refreshes within a moment. The five-minute poll (bounded to 60–3,600
seconds) and foreground refresh remain the recovery path for missed broadcasts.

If bootstrap is unreachable, safe compiled defaults remain usable. Server
kill switches and limits do not rely on the client cache and continue to be
enforced independently.

## Canonical names and rollout

v0.0.6 uses clearer canonical relations:

| Legacy physical name | Canonical v0.0.6 relation |
| --- | --- |
| `sources` | `notification_sources` |
| `api_keys` | `source_access_keys` |
| `source_api_keys` | `notification_source_overview` |
| `notifications` | `inbox_notifications` |
| `push_devices` | `push_registrations` |
| `app_options` | `user_notification_preferences` plus `private.account_entitlements` |
| `app_changelog` | `app_release_notes` plus `app_release_note_items` |
| `universal_app_options` | typed runtime settings and plan limits |
| `private.source_credentials` | `private.source_api_credentials` |
| `private.ingest_requests` | `private.notification_ingest_requests` |
| `private.push_delivery_logs` | `private.push_delivery_attempts` |
| `private.account_rate_events` | `private.account_rate_limit_events` |

The released v0.0.5 app still performs direct upserts and Postgres Realtime
subscriptions against legacy names. Therefore, v0.0.6 introduces canonical
security-invoker views and owner-checked mutation RPCs first. User-scoped
Realtime Broadcast topics (`zona:inbox:<user-id>` and
`zona:live:<user-id>`) remove table names from the new client. Physical base
table renames happen only after v0.0.6 adoption and a release-policy cutover.
