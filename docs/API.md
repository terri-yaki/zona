# Zona notification API

The machine-readable contract is [openapi.yaml](openapi.yaml). If prose and the
contract diverge, treat the deployed behavior as a defect and update both in the
same change.

Each source created in the iPhone app receives a token exactly once. Store that
token in the local application's secret store or environment and send it as a
Bearer credential. Do not put it in source control, logs, query parameters, or
notification metadata.

The app displays a safe API-key registry backed by `public.api_keys`:

| Field | Meaning |
| --- | --- |
| `name` | User-editable PC/application label. |
| `key_prefix` | Short non-secret identifier; never the full key or its hash. |
| `is_active` | Reversible pause/resume switch. Paused keys receive `401`. |
| `sound_name` | Per-source choice: default, silent, a bundled iPhone alert tone (note, aurora, bamboo, chord, circles, complete, hello, input, keys, popcorn, pulse, synth, bell-tower, boing, glass, harp — stored as `ios-*.wav`), or a bundled Zona preset (`zona-*.wav`: soft, bright, urgent, chime, crystal, warm, pulse, signal, bloom). |
| `last_used_at` | Last newly accepted notification. |
| `expires_at` | Optional future expiry. |
| `revoked_at` | Permanent revocation time. |

Notification behavior is stored per account in `public.app_options`.
`push_enabled=false` keeps accepting inbox records but skips remote push;
`play_sound` and `show_preview` control the Expo/APNs payload. The global
`play_sound=false` setting overrides every per-source sound choice.
`live_activity_enabled` is an iPhone client preference for Live Status (ActivityKit);
it does not change the `notify` push payload in v1.

## Send a notification

```http
POST https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify
Authorization: Bearer zona_live_SOURCE_TOKEN
Idempotency-Key: build-2026-07-20-14
Content-Type: application/json

{
  "title": "Build complete",
  "body": "The release build finished successfully.",
  "category": "build",
  "data": {
    "buildId": "2026.07.20.14"
  }
}
```

`title` and `body` are required. `category` and `data` are optional. Metadata
must be a JSON object and is limited to 4 KiB. Source identity is derived from
the token; a caller-supplied source name is ignored because it is not part of
the contract.

`Idempotency-Key` is required and must be a sender-chosen unique event ID of
8–128 characters using letters, digits, and `. _ : -`. Re-sending the same key
with an identical payload returns the original notification with
`idempotentReplay: true` and HTTP `200`; no duplicate row is created and push
is not re-attempted. Reusing the key with a different payload is rejected with
`409 IDEMPOTENCY_CONFLICT`, so generate a fresh key per logical event and keep
it stable only across retries of that event.

Limits:

- Title: 1–120 characters.
- Body: 1–2,000 characters.
- Category: 1–80 characters when present.
- Metadata: JSON object, at most 4 KiB serialized.
- Entire HTTP request body: at most 16 KiB for JSON, 6 MiB for multipart.
- Attachment: one image, PNG/JPEG/WebP, at most 5 MiB.
- Rate: 60 accepted requests per source and 300 per account in a rolling minute.

An accepted request returns HTTP `202`:

```json
{
  "notificationId": "87c4215a-03e3-4c96-af7c-e4043120a514",
  "sourceId": "05c46ccb-0a9e-48c1-9b19-e0398f6ea69b",
  "sourceName": "Office PC",
  "acceptedAt": "2026-07-20T10:30:00.000Z",
  "idempotentReplay": false,
  "attachmentAccepted": false,
  "attachmentError": null,
  "pushAttempted": 1,
  "pushAccepted": 1
}
```

Acceptance means the durable seven-day inbox record exists. Expo push delivery
is best effort and is not retried in version 1. `pushAccepted` is the number of
Expo tickets accepted during the request, not proof that APNs displayed them.

## Attach an evidence image

Send `multipart/form-data` with the same fields plus an `attachment` file part:

```sh
curl -X POST "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify" \
  -H "Authorization: Bearer zona_live_SOURCE_TOKEN" \
  -H "Idempotency-Key: build-2026-07-20-14" \
  -F "title=Build failed" \
  -F "body=Unit tests failed on the release branch; screenshot attached." \
  -F "category=build" \
  -F 'data={"buildId":"2026.07.20.14"}' \
  -F "attachment=@failure-screenshot.png"
```

Only PNG, JPEG, and WebP up to 5 MiB are accepted, and the server decides the
format from magic bytes, not from the file name or content type. The image is
stored in a private bucket readable only by the owning account, is shown in the
notification detail, and is deleted with the same seven-day retention. The
image's hash participates in idempotency, so a retry with the same key and the
same image replays cleanly while the same key with a different image returns
`409 IDEMPOTENCY_CONFLICT`.

Attachment storage is best effort, like push: if the upload fails, the alert is
still accepted and the response reports `attachmentAccepted: false` with
`attachmentError: "UPLOAD_FAILED"`.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | Invalid JSON, field, or size. |
| 400 | `INVALID_IDEMPOTENCY_KEY` | Missing or malformed `Idempotency-Key`. |
| 401 | `INVALID_TOKEN` | Token is missing, incorrect, or revoked. |
| 405 | `METHOD_NOT_ALLOWED` | Endpoint accepts only POST. |
| 409 | `IDEMPOTENCY_CONFLICT` | Key reused with a different payload. |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeded 16 KiB. |
| 429 | `RATE_LIMITED` | Source exceeded 60 requests/minute. |
| 429 | `ACCOUNT_RATE_LIMITED` | Account exceeded 300 requests/minute. |
| 500 | `INTERNAL_ERROR` | The request was not accepted; retry with backoff. |

Local apps should use a short timeout and exponential backoff only for network
failures and HTTP 5xx responses. Do not retry 4xx responses except 429. After
an ambiguous timeout or 5xx, retry with the same `Idempotency-Key` and payload:
the server returns the original record instead of creating a duplicate.
