import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUser, service } from '../_shared/supabase.ts';
import { requiredString } from '../_shared/validation.ts';

const expoTokenPattern = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const deviceId = requiredString(body.deviceId, 200, 'INVALID_DEVICE');
    if (deviceId.length < 8) return json({ error: 'INVALID_DEVICE' }, 400);

    if (body.action === 'unregister') {
      const { error } = await service.rpc('unregister_push_device_internal', {
        p_user_id: user.id,
        p_device_id: deviceId,
      });
      if (error) throw error;
      return json({ unregistered: true }, 200, { 'Cache-Control': 'no-store' });
    }

    if (body.action !== undefined && body.action !== 'register') return json({ error: 'INVALID_ACTION' }, 400);

    const token = requiredString(body.token, 255, 'INVALID_TOKEN');
    if (!expoTokenPattern.test(token) || deviceId.length < 8 || body.platform !== 'ios') {
      return json({ error: 'INVALID_DEVICE' }, 400);
    }

    const { error } = await service.rpc('register_push_device_internal', {
      p_user_id: user.id,
      p_device_id: deviceId,
      p_expo_push_token: token,
      p_platform: 'ios',
    });
    if (error) {
      if (error.message.includes('TOKEN_CONFLICT')) throw new Error('TOKEN_CONFLICT');
      if (error.message.includes('DEVICE_LIMIT_REACHED')) throw new Error('DEVICE_LIMIT_REACHED');
      if (error.message.includes('DEVICE_RATE_LIMITED')) throw new Error('DEVICE_RATE_LIMITED');
      if (error.message.includes('INVALID_DEVICE')) throw new Error('INVALID_DEVICE');
      throw error;
    }

    return json({ registered: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'TOKEN_CONFLICT') return json({ error: code }, 409);
    if (code === 'DEVICE_LIMIT_REACHED') return json({ error: code }, 409);
    if (code === 'DEVICE_RATE_LIMITED') return json({ error: code }, 429, { 'Retry-After': '3600' });
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_TOKEN', 'INVALID_DEVICE', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_DEVICE' }, 400);
    console.error('register-push-token', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
