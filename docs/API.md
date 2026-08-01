# Zona notification API

<!-- markdownlint-disable MD013 -->

Zona exposes one public sender endpoint:

```text
POST https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify
```

Use it from a PC, local script, CI job, server, or any application that can make
an HTTPS request. The machine-readable contract is [openapi.yaml](openapi.yaml).
If this guide, the OpenAPI contract, and deployed behavior disagree, treat that
as a defect and update them together.

The other endpoints in `openapi.yaml` are authenticated account-management
surfaces, not machine-sender APIs. The app may use those endpoints or equivalent
RLS-protected database functions. A notification sender normally needs only
`/notify`.

Operator-controlled availability, plan limits, and safe client presentation
are documented in [RUNTIME_CONTROLS.md](RUNTIME_CONTROLS.md). These controls do
not let a sender select its source, owner, sound, or delivery settings.

## Quick start on Windows

1. In Zona on the iPhone, open **API Keys** and create a source for the PC or
   application.
2. Copy the `zona_live_...` token immediately. Zona shows the complete token
   only once.
3. From the repository root, run:

```powershell
$env:ZONA_SOURCE_TOKEN = 'zona_live_REPLACE_WITH_YOUR_SOURCE_TOKEN'

.\examples\send-notification.ps1 `
  -Title 'Backup complete' `
  -Body 'The nightly backup finished successfully.' `
  -Category 'backup'
```

The command should return a JSON object containing `notificationId`,
`sourceId`, and `sourceName`. The notification is then visible in Zona's inbox,
even if remote push delivery was unavailable.

To include an image:

```powershell
.\examples\send-notification.ps1 `
  -Title 'Build failed' `
  -Body 'The unit tests failed; see the attached screenshot.' `
  -Category 'build' `
  -Attachment 'D:\screenshots\failed-tests.png'
```

The included script works in both Windows PowerShell 5.1 and PowerShell 7.
Windows PowerShell 5.1 does **not** support `Invoke-RestMethod -Form`; the script
uses `HttpClient` for multipart uploads to avoid that incompatibility.

## Authentication: use a Zona source token

The source token is the only credential required by `/notify`:

```http
Authorization: Bearer zona_live_SOURCE_TOKEN
```

Do **not** send any of these to `/notify`:

- A Supabase publishable key.
- A Supabase secret or `service_role` key.
- The iPhone user's Supabase access token.
- A source name, source ID, user ID, hostname, or sound name.

The server hashes the source token and derives the owning account and source
from it. A sender therefore cannot impersonate another source by changing a
request field. Create a separate source for every PC or sending application
that needs an independent identity or sound. A source may have several
independently paused or revoked access keys, which lets you rotate a credential
without changing the source shown in the inbox.

Treat the token like a password. Store it in an environment variable, Windows
Credential Manager, a CI secret, or another OS-backed secret store. Never put
it in source control, URLs, logs, screenshots, or notification `data`.

The app's API-key registry exposes only safe metadata:

| Field | Meaning |
| --- | --- |
| `name` | User-editable label for this particular access key. It does not rename the source. |
| `key_prefix` | Short, non-secret identifier; it is not usable for authentication. |
| `is_active` | Reversible pause/resume switch. A paused key receives `401 INVALID_TOKEN`. |
| `sound_name` | Legacy projection of the source sound; a sender cannot override it per request. |
| `last_used_at` | Last newly accepted notification. An idempotent replay does not advance it. |
| `expires_at` | Optional expiry time. An expired key receives `401 INVALID_TOKEN`. |
| `revoked_at` | Permanent revocation time. A revoked token cannot be restored. |

## Access-key rotation

In v0.0.8, a permanent source and its credentials are separate. For example,
`Office PC` can keep the same source ID, sound, filters, and history while it
has an `Old script` key and a `New agent` key during a safe changeover.

A newly issued plaintext token is returned exactly once. Zona stores only its
SHA-256 hash. Test the replacement token first, then revoke the old key. Never
revoke the whole source just to rotate one credential.

The authenticated Zona app uses these mobile endpoints with the current
Supabase access JWT:

| Endpoint | Purpose |
| --- | --- |
| `POST /functions/v1/create-source` | Create a source and its first key. |
| `POST /functions/v1/create-source-key` | Add a separately labelled key to an existing source. |
| `POST /functions/v1/manage-source-key` | Rename, pause/resume, or permanently revoke one key. |
| `POST /functions/v1/manage-source` | Legacy source-wide action; pause/resume/revoke applies to every key. |

These endpoints are for an authenticated Zona client, not a PC sender. Do not
put the user's Supabase JWT in a script or CI secret.

### Create a replacement key

```http
POST /functions/v1/create-source-key
Authorization: Bearer SUPABASE_USER_ACCESS_JWT
Content-Type: application/json

{
  "sourceId": "05c46ccb-0a9e-48c1-9b19-e0398f6ea69b",
  "keyLabel": "New build agent"
}
```

HTTP `201` returns the secret once and prevents response caching:

```json
{
  "sourceId": "05c46ccb-0a9e-48c1-9b19-e0398f6ea69b",
  "accessKeyId": "190fd6ab-ea65-4a16-b456-f98e3cd6c0dc",
  "keyLabel": "New build agent",
  "token": "zona_live_REPLACE_WITH_THE_ONE_TIME_SECRET",
  "ingestUrl": "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify"
}
```

Move `token` directly to the sender's secure storage. Zona cannot reveal it
again. `sourceId` remains the notification identity; `accessKeyId` selects only
the credential lifecycle.

### Pause, resume, rename, or revoke one key

```json
{ "accessKeyId": "190fd6ab-ea65-4a16-b456-f98e3cd6c0dc", "action": "set_active", "isActive": false }
```

```json
{ "accessKeyId": "190fd6ab-ea65-4a16-b456-f98e3cd6c0dc", "action": "rename", "keyLabel": "Production agent" }
```

```json
{ "accessKeyId": "190fd6ab-ea65-4a16-b456-f98e3cd6c0dc", "action": "revoke" }
```

All three are sent to `POST /functions/v1/manage-source-key`. Pause is
reversible; revoke is permanent. A key action cannot affect a sibling key or a
source owned by another account. Old Zona builds still show one card per
source and intentionally treat their pause/revoke controls as source-wide.

## Request headers

Every request needs the following headers:

| Header | Required | Example | Purpose |
| --- | --- | --- | --- |
| `Authorization` | Yes | `Bearer zona_live_...` | Authenticates one source. Use the `Bearer` scheme exactly. |
| `Idempotency-Key` | Yes | `backup-20260726-020000` | Identifies one logical event and prevents duplicates during retries. |
| `Content-Type` | Yes | `application/json` | Use `multipart/form-data` only when sending an attachment. Let the HTTP library generate the multipart boundary. |

HTTP header names are case-insensitive. Do not place the token or idempotency key
in the URL query string.

## JSON request body

```json
{
  "title": "Build complete",
  "body": "The release build finished successfully.",
  "category": "build",
  "severity": "high",
  "data": {
    "buildId": "2026.07.26.14",
    "branch": "main",
    "durationSeconds": 482
  }
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `title` | string | Yes | 1–120 characters after surrounding whitespace is removed. |
| `body` | string | Yes | 1–2,000 characters after surrounding whitespace is removed. |
| `category` | string or `null` | No | 1–80 characters when present. Omitted, `null`, or `""` means no category. |
| `severity` | string or `null` | No | `low`, `medium`, `high`, or `critical` (case-insensitive). Omitted, `null`, or `""` keeps the default white appearance. |
| `data` | JSON object | No | Defaults to `{}`. The serialized object must be at most 4,096 UTF-8 bytes. Arrays and primitive values are rejected. |

`data` is stored with the inbox item for application-specific context. It does
not alter routing, source identity, sound, severity, or push behavior. Use namespaced,
non-sensitive keys and keep large logs or files outside this field.

Only the documented fields are part of the contract. In particular,
`sourceName`, `sourceId`, `userId`, `sound`, and `pushEnabled` are not supported
request fields. The server controls them.

Although `title` and `body` have character limits, the complete Expo/APNs push
payload also has a conservative 3,800-byte UTF-8 limit. Very long text made of
multi-byte characters can therefore return `400 INVALID_PAYLOAD` before it
reaches the character limit.

### cURL

```sh
curl --request POST \
  "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify" \
  --header "Authorization: Bearer $ZONA_SOURCE_TOKEN" \
  --header "Idempotency-Key: build-20260726-14" \
  --header "Content-Type: application/json" \
  --data '{
    "title": "Build complete",
    "body": "The release build finished successfully.",
    "category": "build",
    "severity": "high",
    "data": {"buildId": "2026.07.26.14", "branch": "main"}
  }'
```

### PowerShell

```powershell
$endpoint = 'https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify'
$eventId = 'deploy-' + [guid]::NewGuid().ToString()
$headers = @{
  Authorization = "Bearer $env:ZONA_SOURCE_TOKEN"
  'Idempotency-Key' = $eventId
}
$payload = @{
  title = 'Deployment complete'
  body = 'Version 0.0.6 is online.'
  category = 'deploy'
  severity = 'medium'
  data = @{
    version = '0.0.6'
    environment = 'production'
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri $endpoint `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $payload `
  -TimeoutSec 10
```

### Severity appearance

Severity is optional and affects presentation, not delivery priority, sound,
rate limits, or source identity:

| Value | Inbox card | Notification icon accent |
| --- | --- | --- |
| omitted / `null` / `""` | White | Zona green |
| `low` | Candy green | Green |
| `medium` | Candy yellow | Yellow |
| `high` | Candy orange | Orange |
| `critical` | Candy red | Red |

Android supports a per-message notification icon accent. iOS controls the app
icon shown in a system notification, so the severity color is visible after
the alert is opened in Zona's inbox rather than tinting the iOS app icon.
Severity participates in idempotency: reusing a key with a different severity
returns `409 IDEMPOTENCY_CONFLICT`.

### Node.js 20+

```js
const endpoint = 'https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify';
const eventId = `health-${crypto.randomUUID()}`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${process.env.ZONA_SOURCE_TOKEN}`,
    'idempotency-key': eventId,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    title: 'Service recovered',
    body: 'The API health check is passing again.',
    category: 'health',
    severity: 'low',
    data: { service: 'orders-api', status: 'healthy' },
  }),
  signal: AbortSignal.timeout(10_000),
});

const result = await response.json();
if (!response.ok) throw new Error(`${response.status}: ${result.error}`);
console.log(result);
```

The repository also includes a ready-to-run Node sender:

```powershell
$env:ZONA_SOURCE_TOKEN = 'zona_live_REPLACE_WITH_YOUR_SOURCE_TOKEN'
$env:ZONA_SEVERITY = 'high' # optional
node .\examples\send-notification.mjs 'Render complete' 'All frames finished.'
```

### Python 3 with `requests`

```python
import os
import uuid
import requests

endpoint = "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify"
response = requests.post(
    endpoint,
    headers={
        "Authorization": f"Bearer {os.environ['ZONA_SOURCE_TOKEN']}",
        "Idempotency-Key": f"job-{uuid.uuid4()}",
    },
    json={
        "title": "Job complete",
        "body": "The data export is ready.",
        "category": "export",
        "data": {"jobId": "export-1842", "rows": 12500},
    },
    timeout=10,
)
response.raise_for_status()
print(response.json())
```

## Idempotency and safe retries

`Idempotency-Key` must be 8–128 characters and match:

```regex
^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$
```

Generate one stable key for each logical event. Reuse that same key only when
retrying the same event with the same payload and attachment.

| Request | Result |
| --- | --- |
| First request with key `build-1842` | `202`; a new inbox record is stored and one durable delivery job is queued for each eligible phone (possibly zero). |
| Same source, same key, same content | `200`; the original record is returned with `idempotentReplay: true`. No new delivery job is queued. |
| Same source, same key, different content or image | `409 IDEMPOTENCY_CONFLICT`; nothing new is stored. |
| Different source, same key | Independent event; idempotency is scoped to the authenticated source. |

Good keys are durable event IDs such as `backup-20260726-020000`, a CI run ID,
or a UUID prefixed with the event type. Do not generate a new key during each
retry, because that creates duplicate notifications.

Retry only network failures, `429`, and `5xx` responses. After a timeout, the
server may already have accepted the event, so retry with the same key and
identical content. Honor the `Retry-After` header on `429` responses.

## Image attachments

Use `multipart/form-data` and send the normal fields as form parts. `data` must
be a JSON-encoded string in multipart requests, not separate nested form fields.
The optional file part must be named `attachment`.

### cURL attachment

```sh
curl --request POST \
  "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify" \
  --header "Authorization: Bearer $ZONA_SOURCE_TOKEN" \
  --header "Idempotency-Key: build-20260726-15" \
  --form "title=Build failed" \
  --form "body=Unit tests failed on the release branch; screenshot attached." \
  --form "category=build" \
  --form "severity=high" \
  --form 'data={"buildId":"2026.07.26.15","branch":"release"}' \
  --form "attachment=@failure-screenshot.png"
```

Do not manually set `Content-Type` in this example. cURL must add the multipart
boundary itself.

### PowerShell attachment

For Windows PowerShell 5.1 or PowerShell 7, use the included compatible helper:

```powershell
$env:ZONA_SOURCE_TOKEN = 'zona_live_REPLACE_WITH_YOUR_SOURCE_TOKEN'
$eventId = 'build-' + [guid]::NewGuid().ToString()

.\examples\send-notification.ps1 `
  -Title 'Build failed' `
  -Body 'Unit tests failed on the release branch.' `
  -Category 'build' `
  -Severity 'high' `
  -IdempotencyKey $eventId `
  -Attachment 'D:\screenshots\failure.png'
```

Keep `$eventId` and reuse it if the command times out and must be retried.

### Python attachment

```python
import json
import os
import requests

endpoint = "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify"
headers = {
    "Authorization": f"Bearer {os.environ['ZONA_SOURCE_TOKEN']}",
    "Idempotency-Key": "build-20260726-16",
}
fields = {
    "title": "Build failed",
    "body": "Unit tests failed; screenshot attached.",
    "category": "build",
    "severity": "high",
    "data": json.dumps({"buildId": "2026.07.26.16"}),
}

with open("failure.png", "rb") as image:
    response = requests.post(
        endpoint,
        headers=headers,
        data=fields,
        files={"attachment": ("failure.png", image, "image/png")},
        timeout=15,
    )

response.raise_for_status()
print(response.json())
```

Attachment rules:

- One optional PNG, JPEG, or WebP image.
- Maximum image size: 5 MiB by default; the operator can tune this per tier,
  so premium accounts may accept larger images.
- Maximum complete multipart request: the image limit plus 1 MiB by default.
- SVG, GIF, PDF, and other file types are rejected.
- The server detects format from the file's magic bytes, not its extension or
  caller-supplied MIME type.
- The image hash participates in idempotency.
- The private image is readable only by the owning account and follows the same
  retention window as the notification.

Attachment storage is best effort. If the inbox record is accepted but Storage
fails, the server still returns `202` with `attachmentAccepted: false` and
`attachmentError: "UPLOAD_FAILED"`. An idempotent replay does not retry the
image upload or push delivery; it only returns the already stored result.

## Successful responses

A newly accepted event returns HTTP `202`:

```json
{
  "notificationId": "87c4215a-03e3-4c96-af7c-e4043120a514",
  "sourceId": "05c46ccb-0a9e-48c1-9b19-e0398f6ea69b",
  "sourceName": "Office PC",
  "acceptedAt": "2026-07-26T10:30:00.000Z",
  "idempotentReplay": false,
  "attachmentAccepted": false,
  "attachmentError": null,
  "pushAttempted": 1,
  "pushAccepted": 0,
  "pushQueued": 1
}
```

An identical replay returns HTTP `200` and the original identifiers/time:

```json
{
  "notificationId": "87c4215a-03e3-4c96-af7c-e4043120a514",
  "sourceId": "05c46ccb-0a9e-48c1-9b19-e0398f6ea69b",
  "sourceName": "Office PC",
  "acceptedAt": "2026-07-26T10:30:00.000Z",
  "idempotentReplay": true,
  "attachmentAccepted": false,
  "attachmentError": null,
  "pushAttempted": 0,
  "pushAccepted": 0
}
```

| Response field | Meaning |
| --- | --- |
| `notificationId` | Durable inbox record UUID. Save it for logging/correlation if useful. |
| `sourceId` | Permanent server identity derived from the token. |
| `sourceName` | Source label stored with this notification. |
| `acceptedAt` | Creation time of the inbox record in UTC. Replays return the original time. |
| `idempotentReplay` | `true` when this response returned an existing record. |
| `attachmentAccepted` | Whether the image is stored. It is `false` when no image was sent. |
| `attachmentError` | `UPLOAD_FAILED` when image storage failed after inbox acceptance; otherwise `null`. |
| `pushQueued` | Number of durable delivery jobs created for eligible phones. Present on a newly accepted event; omitted on an idempotent replay. |
| `pushAttempted` | Compatibility alias. On a new event it currently equals `pushQueued`; on a replay it is `0`. It does not mean that a provider request already ran. |
| `pushAccepted` | Compatibility field retained for older clients. `/notify` returns `0` because Expo ticket and receipt processing happens asynchronously after this response. |

`202` means the seven-day inbox record exists. It does not guarantee an iOS
banner appeared. A valid accepted response can have `pushQueued: 0` when push
is disabled, no phone is registered, or all registrations are disabled. The
worker later sends queued jobs, retries transient failures with bounded
backoff, and checks Expo receipts. A receipt reports the push provider's result;
it is not proof that the user saw the alert.

## Delivery status used by the Zona app

Sender scripts do not call this endpoint. The authenticated Zona app reads one
owned notification through:

```http
POST /rest/v1/rpc/get_notification_delivery_summary
Authorization: Bearer <SUPABASE_USER_ACCESS_TOKEN>
apikey: <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json

{"p_notification_id":"87c4215a-03e3-4c96-af7c-e4043120a514"}
```

```json
{
  "state": "sent",
  "targetedPhones": 2,
  "providerAccepted": 1,
  "failed": 1,
  "pending": 0,
  "updatedAt": "2026-08-01T12:00:00Z",
  "reason": null
}
```

`not_sent` means no eligible phone was targeted, `queued` includes retries and
receipt polling, `sent` means at least one phone service accepted the push, and
`needs_attention` means every targeted job ended without provider acceptance.
Mixed outcomes lead with `sent` and remain visible in the counters. The RPC
returns the same bounded `NOT_FOUND` failure for a missing, expired, or
different owner's notification and never exposes tokens, tickets, leases, or
raw provider messages.

## Delivery behavior controlled in Zona

Senders cannot change these settings in a notification request:

| Setting | Effect |
| --- | --- |
| Source name | Displayed in push content and saved as a historical snapshot on the inbox item. |
| Per-source sound | Selects the bundled iPhone ringtone for that source. `category` does not select a sound. |
| `push_enabled` | When off, Zona still stores the inbox record but skips remote push. |
| `play_sound` | Global override; when off, all source sounds are silent. |
| `show_preview` | When off, the push uses generic text while the full inbox item remains available in Zona. |
| `live_activity_enabled` | iPhone client preference for Live Status; it does not change `/notify` in v1. |

## Limits

The per-account rate, attachment size, retention, and API-key limits are
operator-configured per tier (standard and premium) and can change without an
API redeploy; the values below are the standard-tier defaults. Premium
accounts may have higher values.

| Limit | Standard default |
| --- | --- |
| JSON request body | 16 KiB total |
| Multipart request body | 6 MiB total |
| Attachment | One image, at most 5 MiB |
| `title` | 1–120 characters |
| `body` | 1–2,000 characters |
| `category` | 1–80 characters when present |
| `severity` | `low`, `medium`, `high`, or `critical` when present |
| `data` | JSON object, at most 4 KiB serialized UTF-8 |
| Conservative generated push payload | 3,800 serialized UTF-8 bytes |
| Rate per source | 60 accepted requests in a rolling minute |
| Rate per account | 20 accepted requests in a rolling minute across all sources |
| Active API keys per account | 3 (revoked keys never count) |
| Retention | 7 days |

## Errors

Error responses use a small JSON envelope:

```json
{
  "error": "INVALID_TOKEN"
}
```

| Status | Code | Meaning | Sender action |
| --- | --- | --- | --- |
| `400` | `INVALID_PAYLOAD` | Invalid JSON/form data, field type/value, image, metadata size, or generated push size. | Fix the request; do not retry unchanged. |
| `400` | `INVALID_IDEMPOTENCY_KEY` | Missing or malformed `Idempotency-Key`. | Generate a valid stable event ID. |
| `401` | `INVALID_TOKEN` | Token is missing, malformed, paused, expired, unknown, or revoked. | Check the source in Zona or create a new token. |
| `403` | `ATTACHMENTS_DISABLED` | The operator temporarily disabled image attachments. | Send the same logical event without an image, using a new idempotency key. |
| `403` | `CRITICAL_SEVERITY_DISABLED` | The operator temporarily disabled critical-severity alerts. | Use an allowed severity only if it truthfully represents the event; otherwise wait. |
| `405` | `METHOD_NOT_ALLOWED` | The endpoint accepts only `POST` (plus CORS preflight). | Use `POST`. |
| `409` | `IDEMPOTENCY_CONFLICT` | This source reused a key with different content or a different image. | Use the original content, or a new key for a genuinely new event. |
| `413` | `PAYLOAD_TOO_LARGE` | JSON exceeded 16 KiB or multipart exceeded the configured ceiling. | Reduce the request size. |
| `429` | `RATE_LIMITED` | This source exceeded 60 accepted requests/minute. | Wait for `Retry-After`, then retry with the same key. |
| `429` | `ACCOUNT_RATE_LIMITED` | All sources for the account exceeded the configured per-account rate. | Wait for `Retry-After`, then retry with the same key. |
| `500` | `INTERNAL_ERROR` | The request was not confirmed as accepted. | Retry with backoff, the same key, and identical content. |
| `503` | `SERVICE_UNAVAILABLE` | Notification ingestion is temporarily paused by a fail-closed service switch. | Honor `Retry-After`, then retry with the same key and identical content. |

Use a short client timeout and exponential backoff with jitter for network
failures and `5xx`. Do not automatically retry other `4xx` responses except
`429`. A retry must preserve the original idempotency key, body, and attachment.

## Retention and privacy

Accepted notifications and attachments are retained for the configured
retention window (seven days for standard accounts by default). The inbox
record and eligible delivery jobs are committed before `/notify` responds. A
worker sends queued jobs, performs bounded retries, and checks Expo receipts.
Notification `data`, title, body, source name, and image may reach the phone and
should not contain credentials or secrets.

All traffic must use HTTPS. Never call the database directly from a sender and
never distribute a Supabase secret key to PCs or local applications.
