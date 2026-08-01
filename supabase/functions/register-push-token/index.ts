import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUserSession, service } from '../_shared/supabase.ts';
import { requiredString } from '../_shared/validation.ts';

const expoTokenPattern = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { user, sessionId } = await requireUserSession(req);
    const body = await readJson(req);
    const deviceId = requiredString(body.deviceId, 200, 'INVALID_DEVICE');
    if (deviceId.length < 8) return json({ error: 'INVALID_DEVICE' }, 400);

    if (body.action === 'unregister') {
      const { error } = await service.rpc('unregister_push_device_internal', {
        p_user_id: user.id,
        p_device_id: deviceId,
      });
      if (error) throw error;
      if (/^[0-9a-f-]{36}$/i.test(deviceId)) {
        const { error: subscriptionError } = await service.rpc('set_account_installation_delivery_internal', {
          p_user_id: user.id,
          p_installation_id: deviceId,
          p_delivery_enabled: false,
        });
        if (subscriptionError) throw subscriptionError;
      }
      return json({ unregistered: true }, 200, { 'Cache-Control': 'no-store' });
    }

    if (body.action !== undefined && body.action !== 'register') return json({ error: 'INVALID_ACTION' }, 400);

    // Enforce the session denylist on every register path, including legacy
    // non-UUID device ids that skip installation binding.
    const { error: sessionError } = await service.rpc('assert_account_session_active_internal', {
      p_user_id: user.id,
      p_session_id: sessionId,
    });
    if (sessionError) {
      if (sessionError.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
      if (sessionError.message.includes('INVALID_SESSION')) throw new Error('UNAUTHORIZED');
      throw sessionError;
    }

    const token = requiredString(body.token, 255, 'INVALID_TOKEN');
    const platform = body.platform === 'android' || body.platform === 'ios' ? body.platform : null;
    if (!expoTokenPattern.test(token) || deviceId.length < 8 || !platform) {
      return json({ error: 'INVALID_DEVICE' }, 400);
    }

    if (/^[0-9a-f-]{36}$/i.test(deviceId)) {
      const { error: bindingError } = await service.rpc('bind_account_installation_internal', {
        p_user_id: user.id,
        p_session_id: sessionId,
        p_installation_id: deviceId,
        p_platform: platform,
        p_app_version: null,
        p_build_number: null,
        p_display_name: null,
      });
      if (bindingError) {
        if (bindingError.message.includes('INSTALLATION_CONFLICT')) throw new Error('INSTALLATION_CONFLICT');
        if (bindingError.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
        if (bindingError.message.includes('INVALID_SESSION')) throw new Error('UNAUTHORIZED');
        throw bindingError;
      }

      const { error: reassignmentError } = await service.rpc('prepare_push_token_reassignment_internal', {
        p_user_id: user.id,
        p_session_id: sessionId,
        p_installation_id: deviceId,
        p_expo_push_token: token,
      });
      if (reassignmentError) {
        if (reassignmentError.message.includes('TOKEN_CONFLICT')) throw new Error('TOKEN_CONFLICT');
        if (reassignmentError.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
        if (reassignmentError.message.includes('INVALID_SESSION')) throw new Error('UNAUTHORIZED');
        throw reassignmentError;
      }
    }

    const { error } = await service.rpc('register_push_device_internal', {
      p_user_id: user.id,
      p_device_id: deviceId,
      p_expo_push_token: token,
      p_platform: platform,
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
    if (code === 'INSTALLATION_CONFLICT') return json({ error: code }, 409);
    if (code === 'ACCOUNT_INACTIVE') return json({ error: code }, 423);
    if (code === 'DEVICE_LIMIT_REACHED') return json({ error: code }, 409);
    if (code === 'DEVICE_RATE_LIMITED') return json({ error: code }, 429, { 'Retry-After': '3600' });
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_TOKEN', 'INVALID_DEVICE', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_DEVICE' }, 400);
    console.error('register-push-token', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
