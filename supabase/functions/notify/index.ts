import { sha256, sha256Bytes } from '../_shared/crypto.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readBodyBytes, readJson } from '../_shared/http.ts';
import { sniffImageMime } from '../_shared/image.ts';
import { FALLBACK_ATTACHMENT_MAX_BYTES, MULTIPART_OVERHEAD_BYTES, type SenderLimits } from '../_shared/limits.ts';
import { assertPushPayloadFits } from '../_shared/push.ts';
import { service } from '../_shared/supabase.ts';
import { type NotificationSeverity, parseSeverity } from '../_shared/severity.ts';
import { idempotencyKey, optionalString, requiredString } from '../_shared/validation.ts';
import { elapsedMs, recordServerEvent } from '../_shared/server-telemetry.ts';

type IngestResult = {
  notification_id: string;
  source_id: string;
  source_name: string;
  owner_user_id: string;
  created_at: string;
  idempotent_replay: boolean;
  attachment_path: string | null;
};

type NotifyPayload = {
  title: string;
  body: string;
  category: string | null;
  severity: NotificationSeverity | null;
  metadata: Record<string, unknown>;
  attachment: { bytes: Uint8Array; mime: string } | null;
};

type IngestPolicy = SenderLimits & {
  acceptNotifications: boolean;
  allowAttachments: boolean;
  allowCriticalSeverity: boolean;
  deliverPush: boolean;
  maxPushDevices: number;
};

// The attachment cap is operator-configured per tier, so it must be resolved
// before the request body is parsed. A lookup failure stops ingestion rather
// than guessing at a security limit. Postgres re-checks the same limit at
// attach time, so this pre-check can never widen the real boundary.
async function resolvePolicy(tokenHash: string): Promise<IngestPolicy> {
  const { data, error } = await service.rpc('notification_ingest_policy_internal', {
    p_token_hash: tokenHash,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    console.error('notification ingest policy lookup', error);
    throw new Error('SERVICE_UNAVAILABLE');
  }
  const policy = data as Record<string, unknown>;
  const configuredBytes = typeof policy.attachmentMaxBytes === 'number'
    ? Math.trunc(policy.attachmentMaxBytes)
    : FALLBACK_ATTACHMENT_MAX_BYTES;
  const attachmentMaxBytes = configuredBytes >= 1024 && configuredBytes <= 52_428_800 ? configuredBytes : FALLBACK_ATTACHMENT_MAX_BYTES;
  const configuredDevices = typeof policy.maxPushDevices === 'number' ? Math.trunc(policy.maxPushDevices) : 10;
  return {
    acceptNotifications: policy.acceptNotifications === true,
    allowAttachments: policy.allowAttachments === true,
    allowCriticalSeverity: policy.allowCriticalSeverity === true,
    deliverPush: policy.deliverPush === true,
    maxPushDevices: Math.min(1000, Math.max(1, configuredDevices)),
    attachmentMaxBytes,
    multipartMaxBytes: attachmentMaxBytes + MULTIPART_OVERHEAD_BYTES,
  };
}

function sourceToken(req: Request): string {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('INVALID_TOKEN');
  const token = authorization.slice(7);
  if (!/^zona_live_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('INVALID_TOKEN');
  return token;
}

function metadataOrThrow(value: unknown): Record<string, unknown> {
  const metadata = value === undefined ? {} : value;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('INVALID_PAYLOAD');
  if (new TextEncoder().encode(JSON.stringify(metadata)).length > 4_096) throw new Error('INVALID_PAYLOAD');
  return metadata as Record<string, unknown>;
}

async function readNotifyPayload(req: Request, limits: IngestPolicy): Promise<NotifyPayload> {
  const type = req.headers.get('content-type') ?? '';
  if (type.toLowerCase().includes('multipart/form-data')) return readMultipartPayload(req, limits);

  const body = await readJson(req);
  const title = requiredString(body.title, 120);
  const messageBody = requiredString(body.body, 2_000);
  const category = optionalString(body.category, 80);
  const severity = parseSeverity(body.severity);
  const metadata = metadataOrThrow(body.data);
  assertPushPayloadFits(title, messageBody, severity);
  return { title, body: messageBody, category, severity, metadata, attachment: null };
}

async function readMultipartPayload(req: Request, limits: IngestPolicy): Promise<NotifyPayload> {
  // Cap the stream itself so a missing or understated Content-Length cannot
  // force the runtime to buffer an unbounded body before formData parsing.
  const contentType = req.headers.get('content-type') ?? '';
  const bytes = await readBodyBytes(req, limits.multipartMaxBytes, 'INVALID_PAYLOAD');

  let form: FormData;
  try {
    const body = bytes.slice().buffer as ArrayBuffer;
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new Error('INVALID_PAYLOAD');
  }

  const title = requiredString(form.get('title'), 120);
  const messageBody = requiredString(form.get('body'), 2_000);
  const category = optionalString(form.get('category'), 80);
  const severity = parseSeverity(form.get('severity'));

  const rawData = form.get('data');
  let parsedData: unknown;
  if (typeof rawData === 'string' && rawData.trim() !== '') {
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      throw new Error('INVALID_PAYLOAD');
    }
  }
  const metadata = metadataOrThrow(parsedData);

  // One optional evidence image. Content type comes from magic bytes only.
  const file = form.get('attachment');
  let attachment: NotifyPayload['attachment'] = null;
  if (file !== null) {
    if (!limits.allowAttachments) throw new Error('ATTACHMENTS_DISABLED');
    if (typeof file === 'string') throw new Error('INVALID_PAYLOAD');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = bytes.byteLength > 0 && bytes.byteLength <= limits.attachmentMaxBytes ? sniffImageMime(bytes) : null;
    if (!mime) throw new Error('INVALID_PAYLOAD');
    attachment = { bytes, mime };
  }

  assertPushPayloadFits(title, messageBody, severity);
  return { title, body: messageBody, category, severity, metadata, attachment };
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let ownerUserId: string | null = null;
  let sourceId: string | null = null;
  let notificationId: string | null = null;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const tokenHash = await sha256(sourceToken(req));
    const requestKey = idempotencyKey(req.headers.get('idempotency-key'));
    const policy = await resolvePolicy(tokenHash);
    if (!policy.acceptNotifications) throw new Error('SERVICE_UNAVAILABLE');
    const payload = await readNotifyPayload(req, policy);
    if (payload.severity === 'critical' && !policy.allowCriticalSeverity) {
      throw new Error('CRITICAL_SEVERITY_DISABLED');
    }
    const attachmentHash = payload.attachment ? await sha256Bytes(payload.attachment.bytes) : null;

    const { data, error } = await service.rpc('ingest_notification_internal', {
      p_token_hash: tokenHash,
      p_idempotency_key: requestKey,
      p_title: payload.title,
      p_body: payload.body,
      p_category: payload.category,
      p_severity: payload.severity,
      p_data: payload.metadata,
      p_attachment_hash: attachmentHash,
    });
    if (error) {
      if (error.message.includes('INVALID_TOKEN')) throw new Error('INVALID_TOKEN');
      if (error.message.includes('IDEMPOTENCY_CONFLICT')) throw new Error('IDEMPOTENCY_CONFLICT');
      if (error.message.includes('INVALID_IDEMPOTENCY_KEY')) throw new Error('INVALID_IDEMPOTENCY_KEY');
      if (error.message.includes('ACCOUNT_RATE_LIMITED')) throw new Error('ACCOUNT_RATE_LIMITED');
      if (error.message.includes('RATE_LIMITED')) throw new Error('RATE_LIMITED');
      if (error.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
      if (error.message.includes('NOTIFICATION_INGESTION_DISABLED')) throw new Error('SERVICE_UNAVAILABLE');
      if (error.message.includes('CRITICAL_SEVERITY_DISABLED')) throw new Error('CRITICAL_SEVERITY_DISABLED');
      if (error.message.includes('INVALID_PAYLOAD')) throw new Error('INVALID_PAYLOAD');
      throw error;
    }

    const accepted = (data as IngestResult[] | null)?.[0];
    if (!accepted) throw new Error('INGEST_FAILED');
    ownerUserId = accepted.owner_user_id;
    sourceId = accepted.source_id;
    notificationId = accepted.notification_id;

    if (accepted.idempotent_replay) {
      await recordServerEvent({
        requestId,
        component: 'notify',
        eventName: 'notification.replayed',
        userId: ownerUserId,
        sourceId,
        notificationId,
        statusCode: 200,
        durationMs: elapsedMs(startedAt),
      });
      return json(
        {
          notificationId: accepted.notification_id,
          sourceId: accepted.source_id,
          sourceName: accepted.source_name,
          acceptedAt: accepted.created_at,
          idempotentReplay: true,
          attachmentAccepted: Boolean(accepted.attachment_path),
          attachmentError: null,
          pushAttempted: 0,
          pushAccepted: 0,
        },
        200,
        { 'Cache-Control': 'no-store' },
      );
    }

    let attachmentAccepted = false;
    let attachmentError: string | null = null;
    if (payload.attachment) {
      const attachmentPath = `${accepted.owner_user_id}/${accepted.notification_id}`;
      let uploaded = false;
      try {
        const { error: uploadError } = await service.storage
          .from('notification-attachments')
          .upload(attachmentPath, payload.attachment.bytes, { contentType: payload.attachment.mime, upsert: false });
        if (uploadError) throw uploadError;
        uploaded = true;
        const { error: attachError } = await service.rpc('attach_notification_image_internal', {
          p_notification_id: accepted.notification_id,
          p_path: attachmentPath,
          p_mime: payload.attachment.mime,
          p_bytes: payload.attachment.bytes.byteLength,
        });
        if (attachError) throw attachError;
        attachmentAccepted = true;
      } catch (uploadFailure) {
        // Like push, attachment storage is best-effort: the durable inbox row
        // must never turn into an ambiguous 5xx because Storage failed.
        console.error('attachment upload failed', uploadFailure);
        if (uploaded) {
          const { error: removeError } = await service.storage
            .from('notification-attachments')
            .remove([attachmentPath]);
          if (removeError) console.error('orphan attachment cleanup failed', removeError);
        }
        attachmentError = 'UPLOAD_FAILED';
      }
    }

    const { data: queueCount, error: queueError } = await service.rpc(
      'get_notification_push_queue_count_internal',
      { p_user_id: accepted.owner_user_id, p_notification_id: accepted.notification_id },
    );
    if (queueError) console.error('push queue count unavailable', queueError);
    const pushQueued = typeof queueCount === 'number' ? queueCount : 0;

    await recordServerEvent({
      requestId,
      component: 'notify',
      eventName: 'notification.accepted',
      userId: ownerUserId,
      sourceId,
      notificationId,
      statusCode: 202,
      durationMs: elapsedMs(startedAt),
      context: {
        attachmentAccepted,
        attachmentRequested: payload.attachment !== null,
        pushAccepted: 0,
        pushAttempted: pushQueued,
        pushQueued,
        severity: payload.severity,
      },
    });
    return json(
      {
        notificationId: accepted.notification_id,
        sourceId: accepted.source_id,
        sourceName: accepted.source_name,
        acceptedAt: accepted.created_at,
        idempotentReplay: false,
        attachmentAccepted,
        attachmentError,
        pushAttempted: pushQueued,
        pushAccepted: 0,
        pushQueued,
      },
      202,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const statusCode = code === 'INVALID_TOKEN'
      ? 401
      : code === 'IDEMPOTENCY_CONFLICT'
      ? 409
      : ['RATE_LIMITED', 'ACCOUNT_RATE_LIMITED'].includes(code)
      ? 429
      : code === 'PAYLOAD_TOO_LARGE'
      ? 413
      : code === 'SERVICE_UNAVAILABLE'
      ? 503
      : code === 'ACCOUNT_INACTIVE'
      ? 423
      : ['ATTACHMENTS_DISABLED', 'CRITICAL_SEVERITY_DISABLED'].includes(code)
      ? 403
      : ['INVALID_PAYLOAD', 'INVALID_IDEMPOTENCY_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)
      ? 400
      : 500;
    await recordServerEvent({
      requestId,
      component: 'notify',
      eventName: 'notification.rejected',
      level: statusCode >= 500 ? 'error' : 'warning',
      userId: ownerUserId,
      sourceId,
      notificationId,
      statusCode,
      durationMs: elapsedMs(startedAt),
      message: code,
    });
    if (code === 'INVALID_TOKEN') return json({ error: code }, 401);
    if (code === 'IDEMPOTENCY_CONFLICT') return json({ error: code }, 409);
    if (['RATE_LIMITED', 'ACCOUNT_RATE_LIMITED'].includes(code)) {
      return json({ error: code }, 429, { 'Retry-After': '60' });
    }
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (code === 'SERVICE_UNAVAILABLE') return json({ error: code }, 503, { 'Retry-After': '60' });
    if (code === 'ACCOUNT_INACTIVE') return json({ error: code }, 423);
    if (['ATTACHMENTS_DISABLED', 'CRITICAL_SEVERITY_DISABLED'].includes(code)) {
      return json({ error: code }, 403);
    }
    if (['INVALID_PAYLOAD', 'INVALID_IDEMPOTENCY_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: code === 'INVALID_IDEMPOTENCY_KEY' ? code : 'INVALID_PAYLOAD' }, 400);
    }
    console.error('notify', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
