import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { createPushMessage, type ExpoTicket, resolveDeviceSound, resolveSound, ticketError } from '../_shared/push.ts';
import { requireUser, service } from '../_shared/supabase.ts';
import { uuid } from '../_shared/validation.ts';

type TestNotification = {
  notification_id: string;
  source_id: string;
  source_name: string;
  owner_user_id: string;
  created_at: string;
  sound_name: string;
};

type PushDevice = { id: string; expo_push_token: string; platform: 'android' | 'ios' };
type AppOptions = { push_enabled: boolean; play_sound: boolean; show_preview: boolean };

const expoEndpoint = 'https://exp.host/--/api/v2/push/send';

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
  deviceId: string | null,
  httpStatus: number | null,
  response: unknown,
  errorMessage: string | null,
) {
  try {
    const { error } = await service.rpc('record_push_delivery_internal', {
      p_notification_id: notificationId,
      p_push_device_id: deviceId,
      p_http_status: httpStatus,
      p_response: response,
      p_error_message: errorMessage,
    });
    if (error) console.error('test delivery log failed', error);
  } catch (error) {
    console.error('test delivery log unavailable', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const sourceId = uuid(body.sourceId);
    const { data, error } = await service.rpc('create_test_notification_internal', {
      p_user_id: user.id,
      p_source_id: sourceId,
    });
    if (error) {
      if (error.message.includes('SOURCE_NOT_FOUND')) throw new Error('SOURCE_NOT_FOUND');
      if (error.message.includes('INVALID_TOKEN')) throw new Error('SOURCE_INACTIVE');
      throw error;
    }

    const accepted = (data as TestNotification[] | null)?.[0];
    if (!accepted) throw new Error('SOURCE_NOT_FOUND');

    const { data: storedOptions, error: optionsError } = await service
      .from('app_options')
      .select('push_enabled, play_sound, show_preview')
      .eq('user_id', user.id)
      .maybeSingle();
    if (optionsError) console.error('test app options lookup', optionsError);
    const options = (storedOptions as AppOptions | null) ?? {
      push_enabled: true,
      play_sound: true,
      show_preview: true,
    };

    const { data: storedDevices, error: devicesError } = options.push_enabled
      ? await service
        .from('push_devices')
        .select('id, expo_push_token, platform')
        .eq('user_id', user.id)
        .is('disabled_at', null)
        .order('updated_at', { ascending: false })
        .limit(10)
      : { data: [], error: null };
    if (devicesError) console.error('test push device lookup', devicesError);

    const devices = (storedDevices ?? []) as PushDevice[];
    const messages = devices.map((device) =>
      createPushMessage(
        device.expo_push_token,
        'Zona is connected',
        `This test alert came from ${accepted.source_name}.`,
        accepted.source_name,
        accepted.notification_id,
        accepted.source_id,
        {
          soundName: resolveDeviceSound(device.platform, resolveSound(options.play_sound, accepted.sound_name)),
          showPreview: options.show_preview,
        },
      )
    );

    let pushAccepted = 0;
    if (messages.length) {
      try {
        const response = await fetch(expoEndpoint, {
          method: 'POST',
          headers: expoHeaders(),
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(5_000),
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

        await Promise.all(devices.map(async (device, index) => {
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
        }));
      } catch (pushError) {
        const message = pushError instanceof Error ? pushError.message.slice(0, 500) : 'UNKNOWN_PUSH_ERROR';
        await Promise.all(devices.map((device) => recordDelivery(accepted.notification_id, device.id, null, null, message)));
      }
    }

    return json(
      {
        notificationId: accepted.notification_id,
        sourceId: accepted.source_id,
        pushAttempted: devices.length,
        pushAccepted,
      },
      202,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'SOURCE_NOT_FOUND') return json({ error: code }, 404);
    if (code === 'SOURCE_INACTIVE') return json({ error: code }, 409);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_SOURCE', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: 'INVALID_SOURCE' }, 400);
    }
    console.error('test-source', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
