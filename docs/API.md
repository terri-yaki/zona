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
request field. Create a separate source/token for every PC or sending
application that needs an independent identity, sound, pause switch, or
revocation boundary.

Treat the token like a password. Store it in an environment variable, Windows
Credential Manager, a CI secret, or another OS-backed secret store. Never put
it in source control, URLs, logs, screenshots, or notification `data`.

The app's API-key registry exposes only safe metadata:

| Field | Meaning |
| --- | --- |
| `name` | User-editable PC/application label. This becomes the source shown by Zona. |
| `key_prefix` | Short, non-secret identifier; it is not usable for authentication. |
| `is_active` | Reversible pause/resume switch. A paused key receives `401 INVALID_TOKEN`. |
| `sound_name` | Per-source sound selected in Zona; a sender cannot override it per request. |
| `last_used_at` | Last newly accepted notification. An idempotent replay does not advance it. |
| `expires_at` | Optional expiry time. An expired key receives `401 INVALID_TOKEN`. |
| `revoked_at` | Permanent revocation time. A revoked token cannot be restored. |

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
| `data` | JSON object | No | Defaults to `{}`. The serialized object must be at most 4,096 UTF-8 bytes. Arrays and primitive values are rejected. |

`data` is stored with the inbox item for application-specific context. It does
not alter routing, source identity, sound, or push behavior. Use namespaced,
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
  body = 'Version 0.0.3 is online.'
  category = 'deploy'
  data = @{
    version = '0.0.3'
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
| First request with key `build-1842` | `202`; a new inbox record is stored and best-effort push processing runs (possibly targeting zero devices). |
| Same source, same key, same content | `200`; the original record is returned with `idempotentReplay: true`. No new push is attempted. |
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
- Maximum image size: 5 MiB.
- Maximum complete multipart request: 6 MiB.
- SVG, GIF, PDF, and other file types are rejected.
- The server detects format from the file's magic bytes, not its extension or
  caller-supplied MIME type.
- The image hash participates in idempotency.
- The private image is readable only by the owning account and follows the same
  seven-day retention as the notification.

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
  "pushAccepted": 1
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
| `pushAttempted` | Number of active iPhone push registrations targeted during this request. |
| `pushAccepted` | Number of Expo push tickets accepted during this request. This is not APNs display confirmation. |

`202` means the seven-day inbox record exists. It does not guarantee an iOS
banner appeared. A valid accepted response can have `pushAttempted: 0` when
push is disabled, no iPhone is registered, or all registrations are disabled.
It can also have `pushAccepted: 0` after best-effort delivery failure.

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

| Limit | Value |
| --- | --- |
| JSON request body | 16 KiB total |
| Multipart request body | 6 MiB total |
| Attachment | One image, at most 5 MiB |
| `title` | 1–120 characters |
| `body` | 1–2,000 characters |
| `category` | 1–80 characters when present |
| `data` | JSON object, at most 4 KiB serialized UTF-8 |
| Conservative generated push payload | 3,800 serialized UTF-8 bytes |
| Rate per source | 60 accepted requests in a rolling minute |
| Rate per account | 300 accepted requests in a rolling minute across all sources |

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
| `405` | `METHOD_NOT_ALLOWED` | The endpoint accepts only `POST` (plus CORS preflight). | Use `POST`. |
| `409` | `IDEMPOTENCY_CONFLICT` | This source reused a key with different content or a different image. | Use the original content, or a new key for a genuinely new event. |
| `413` | `PAYLOAD_TOO_LARGE` | JSON exceeded 16 KiB or multipart exceeded 6 MiB. | Reduce the request size. |
| `429` | `RATE_LIMITED` | This source exceeded 60 accepted requests/minute. | Wait for `Retry-After`, then retry with the same key. |
| `429` | `ACCOUNT_RATE_LIMITED` | All sources for the account exceeded 300 accepted requests/minute. | Wait for `Retry-After`, then retry with the same key. |
| `500` | `INTERNAL_ERROR` | The request was not confirmed as accepted. | Retry with backoff, the same key, and identical content. |

Use a short client timeout and exponential backoff with jitter for network
failures and `5xx`. Do not automatically retry other `4xx` responses except
`429`. A retry must preserve the original idempotency key, body, and attachment.

## Retention and privacy

Accepted notifications and attachments are retained for seven days. The inbox
record is inserted before the one best-effort Expo push request. Notification
`data`, title, body, source name, and image may reach the iPhone and should not
contain credentials or secrets.

All traffic must use HTTPS. Never call the database directly from a sender and
never distribute a Supabase secret key to PCs or local applications.
