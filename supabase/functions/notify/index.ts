import { sha256, sha256Bytes } from '../_shared/crypto.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { MAX_IMAGE_BYTES, sniffImageMime } from '../_shared/image.ts';
import {
  assertPushPayloadFits,
  byteLength,
  chunk,
  createPushMessage,
  type ExpoTicket,
  MAX_EXPO_MESSAGE_BYTES,
  resolveDeviceSound,
  resolveSound,
  ticketError,
} from '../_shared/push.ts';
import { service } from '../_shared/supabase.ts';
import { idempotencyKey, optionalString, requiredString } from '../_shared/validation.ts';

type IngestResult = {
  notification_id: string;
  source_id: string;
  source_name: string;
  owner_user_id: string;
  created_at: string;
  idempotent_replay: boolean;
  attachment_path: string | null;
};

type PushDevice = { id: string; expo_push_token: string; platform: 'android' | 'ios' };

type AppOptions = {
  push_enabled: boolean;
  play_sound: boolean;
  show_preview: boolean;
};

type SourceOptions = { sound_name: string };

type NotifyPayload = {
  title: string;
  body: string;
  category: string | null;
  metadata: Record<string, unknown>;
  attachment: { bytes: Uint8Array; mime: string } | null;
};

const expoEndpoint = 'https://exp.host/--/api/v2/push/send';
const expoTimeoutMs = 5_000;
const maximumPushDevices = 10;
const maxMultipartBytes = 6 * 1024 * 1024;

function sourceToken(req: Request): string {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('INVALID_TOKEN');
  const token = authorization.slice(7);
  if (!/^zona_live_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('INVALID_TOKEN');
  return token;
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function recordDelivery(
  notificationId: string,
  pushDeviceId: string | null,
  httpStatus: number | null,
  response: unknown,
  errorMessage: string | null,
): Promise<void> {
  try {
    const { error } = await service.rpc('record_push_delivery_internal', {
      p_notification_id: notificationId,
      p_push_device_id: pushDeviceId,
      p_http_status: httpStatus,
      p_response: response,
      p_error_message: errorMessage,
    });
    if (error) console.error('push delivery log failed', error);
  } catch (error) {
    // Delivery logging is observability only. It must never turn a durably
    // accepted notification into an ambiguous 5xx response.
    console.error('push delivery log unavailable', error);
  }
}

async function disableUnregisteredDevice(deviceId: string, ownerUserId: string): Promise<void> {
  try {
    const { error } = await service
      .from('push_devices')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', deviceId)
      .eq('user_id', ownerUserId);
    if (error) console.error('could not disable unregistered push device', error);
  } catch (error) {
    console.error('could not disable unregistered push device', error);
  }
}

function metadataOrThrow(value: unknown): Record<string, unknown> {
  const metadata = value === undefined ? {} : value;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('INVALID_PAYLOAD');
  if (new TextEncoder().encode(JSON.stringify(metadata)).length > 4_096) throw new Error('INVALID_PAYLOAD');
  return metadata as Record<string, unknown>;
}

async function readNotifyPayload(req: Request): Promise<NotifyPayload> {
  const type = req.headers.get('content-type') ?? '';
  if (type.toLowerCase().includes('multipart/form-data')) return readMultipartPayload(req);

  const body = await readJson(req);
  const title = requiredString(body.title, 120);
  const messageBody = requiredString(body.body, 2_000);
  const category = optionalString(body.category, 80);
  const metadata = metadataOrThrow(body.data);
  assertPushPayloadFits(title, messageBody);
  return { title, body: messageBody, category, metadata, attachment: null };
}

async function readMultipartPayload(req: Request): Promise<NotifyPayload> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxMultipartBytes) throw new Error('PAYLOAD_TOO_LARGE');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new Error('INVALID_PAYLOAD');
  }

  const title = requiredString(form.get('title'), 120);
  const messageBody = requiredString(form.get('body'), 2_000);
  const category = optionalString(form.get('category'), 80);

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
    if (typeof file === 'string') throw new Error('INVALID_PAYLOAD');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES ? sniffImageMime(bytes) : null;
    if (!mime) throw new Error('INVALID_PAYLOAD');
    attachment = { bytes, mime };
  }

  assertPushPayloadFits(title, messageBody);
  return { title, body: messageBody, category, metadata, attachment };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const tokenHash = await sha256(sourceToken(req));
    const requestKey = idempotencyKey(req.headers.get('idempotency-key'));
    const payload = await readNotifyPayload(req);
    const attachmentHash = payload.attachment ? await sha256Bytes(payload.attachment.bytes) : null;

    const { data, error } = await service.rpc('ingest_notification_internal', {
      p_token_hash: tokenHash,
      p_idempotency_key: requestKey,
      p_title: payload.title,
      p_body: payload.body,
      p_category: payload.category,
      p_data: payload.metadata,
      p_attachment_hash: attachmentHash,
    });
    if (error) {
      if (error.message.includes('INVALID_TOKEN')) throw new Error('INVALID_TOKEN');
      if (error.message.includes('IDEMPOTENCY_CONFLICT')) throw new Error('IDEMPOTENCY_CONFLICT');
      if (error.message.includes('INVALID_IDEMPOTENCY_KEY')) throw new Error('INVALID_IDEMPOTENCY_KEY');
      if (error.message.includes('ACCOUNT_RATE_LIMITED')) throw new Error('ACCOUNT_RATE_LIMITED');
      if (error.message.includes('RATE_LIMITED')) throw new Error('RATE_LIMITED');
      if (error.message.includes('INVALID_PAYLOAD')) throw new Error('INVALID_PAYLOAD');
      throw error;
    }

    const accepted = (data as IngestResult[] | null)?.[0];
    if (!accepted) throw new Error('INGEST_FAILED');

    if (accepted.idempotent_replay) {
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
      try {
        const { error: uploadError } = await service.storage
          .from('notification-attachments')
          .upload(attachmentPath, payload.attachment.bytes, { contentType: payload.attachment.mime, upsert: false });
        if (uploadError) throw uploadError;
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
        attachmentError = 'UPLOAD_FAILED';
      }
    }

    const [optionsResult, sourceOptionsResult] = await Promise.all([
      service
        .from('app_options')
        .select('push_enabled, play_sound, show_preview')
        .eq('user_id', accepted.owner_user_id)
        .maybeSingle(),
      service
        .from('api_keys')
        .select('sound_name')
        .eq('user_id', accepted.owner_user_id)
        .eq('source_id', accepted.source_id)
        .maybeSingle(),
    ]);

    if (optionsResult.error) console.error('app options lookup', optionsResult.error);
    if (sourceOptionsResult.error) console.error('source options lookup', sourceOptionsResult.error);
    const appOptions = (optionsResult.data as AppOptions | null) ?? {
      push_enabled: true,
      play_sound: true,
      show_preview: true,
    };
    const soundName = resolveSound(
      appOptions.play_sound,
      (sourceOptionsResult.data as SourceOptions | null)?.sound_name,
    );
    // Help diagnose “always default” reports: confirm which tone the payload will request.
    console.log('notify push sound', {
      sourceId: accepted.source_id,
      stored: (sourceOptionsResult.data as SourceOptions | null)?.sound_name ?? null,
      resolved: soundName,
    });

    const { data: pushDevices, error: devicesError } = appOptions.push_enabled
      ? await service
        .from('push_devices')
        .select('id, expo_push_token, platform')
        .eq('user_id', accepted.owner_user_id)
        .is('disabled_at', null)
        .order('updated_at', { ascending: false })
        .limit(maximumPushDevices)
      : { data: [], error: null };

    if (devicesError) {
      console.error('push device lookup', devicesError);
      await recordDelivery(accepted.notification_id, null, null, null, 'PUSH_DEVICE_LOOKUP_FAILED');
    }

    let pushAccepted = 0;
    const devices = (pushDevices ?? []) as PushDevice[];
    for (const deviceBatch of chunk(devices)) {
      const messages = deviceBatch.map((device) =>
        createPushMessage(
          device.expo_push_token,
          payload.title,
          payload.body,
          accepted.source_name,
          accepted.notification_id,
          accepted.source_id,
          { soundName: resolveDeviceSound(device.platform, soundName), showPreview: appOptions.show_preview },
        )
      );

      // The conservative pre-ingest check should make this unreachable, but
      // retain a final check against actual source/token values as defense in depth.
      if (messages.some((message) => byteLength(message) > MAX_EXPO_MESSAGE_BYTES)) {
        await Promise.all(deviceBatch.map((device) =>
          recordDelivery(
            accepted.notification_id,
            device.id,
            null,
            null,
            'MESSAGE_TOO_BIG',
          )
        ));
        continue;
      }

      try {
        const response = await fetch(expoEndpoint, {
          method: 'POST',
          headers: expoHeaders(),
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(expoTimeoutMs),
        });
        const responseBody: unknown = await response.json().catch(() => null);
        const ticketData = responseBody && typeof responseBody === 'object' && 'data' in responseBody
          ? (responseBody as { data?: unknown }).data
          : null;
        const tickets: ExpoTicket[] = Array.isArray(ticketData)
          ? ticketData as ExpoTicket[]
          : ticketData && typeof ticketData === 'object'
          ? [ticketData as ExpoTicket]
          : [];

        await Promise.all(deviceBatch.map(async (device, index) => {
          const ticket = tickets[index] ?? null;
          const deliveryError = ticketError(ticket, response.ok);
          if (!deliveryError) pushAccepted += 1;
          await recordDelivery(
            accepted.notification_id,
            device.id,
            response.status,
            ticket ?? responseBody,
            deliveryError,
          );
          if (deliveryError === 'DeviceNotRegistered') {
            await disableUnregisteredDevice(device.id, accepted.owner_user_id);
          }
        }));
      } catch (pushError) {
        const errorMessage = pushError instanceof DOMException && pushError.name === 'TimeoutError'
          ? 'EXPO_TIMEOUT'
          : pushError instanceof Error
          ? pushError.message.slice(0, 500)
          : 'UNKNOWN_PUSH_ERROR';
        console.error('best-effort push failed', pushError);
        await Promise.all(deviceBatch.map((device) =>
          recordDelivery(
            accepted.notification_id,
            device.id,
            null,
            null,
            errorMessage,
          )
        ));
      }
    }

    return json(
      {
        notificationId: accepted.notification_id,
        sourceId: accepted.source_id,
        sourceName: accepted.source_name,
        acceptedAt: accepted.created_at,
        idempotentReplay: false,
        attachmentAccepted,
        attachmentError,
        pushAttempted: devices.length,
        pushAccepted,
      },
      202,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'INVALID_TOKEN') return json({ error: code }, 401);
    if (code === 'IDEMPOTENCY_CONFLICT') return json({ error: code }, 409);
    if (['RATE_LIMITED', 'ACCOUNT_RATE_LIMITED'].includes(code)) {
      return json({ error: code }, 429, { 'Retry-After': '60' });
    }
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_PAYLOAD', 'INVALID_IDEMPOTENCY_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: code === 'INVALID_IDEMPOTENCY_KEY' ? code : 'INVALID_PAYLOAD' }, 400);
    }
    console.error('notify', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
