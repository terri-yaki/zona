import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUserSession, service } from '../_shared/supabase.ts';
import { optionalString, requiredString, uuid } from '../_shared/validation.ts';

const actions = new Set(['rename', 'set_active', 'revoke']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { user, sessionId } = await requireUserSession(req);
    const body = await readJson(req);
    const accessKeyId = uuid(body.accessKeyId);
    const action = requiredString(body.action, 32, 'INVALID_ACTION');
    if (!actions.has(action)) throw new Error('INVALID_ACTION');

    const keyLabel = action === 'rename'
      ? requiredString(body.keyLabel, 80, 'INVALID_SOURCE_KEY')
      : optionalString(body.keyLabel, 80, 'INVALID_SOURCE_KEY');
    const isActive = action === 'set_active' && typeof body.isActive === 'boolean' ? body.isActive : null;
    if (action === 'set_active' && isActive === null) throw new Error('INVALID_SOURCE_KEY');

    const { error: accountError } = await service.rpc('assert_account_session_active_internal', {
      p_user_id: user.id,
      p_session_id: sessionId,
    });
    if (accountError) {
      if (accountError.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
      if (accountError.message.includes('INVALID_SESSION')) throw new Error('UNAUTHORIZED');
      throw accountError;
    }

    const { data, error } = await service.rpc('manage_source_key_internal', {
      p_user_id: user.id,
      p_access_key_id: accessKeyId,
      p_action: action,
      p_key_label: keyLabel,
      p_is_active: isActive,
    });
    if (error) {
      if (error.message.includes('INVALID_ACTION')) throw new Error('INVALID_ACTION');
      if (error.message.includes('INVALID_SOURCE_KEY')) throw new Error('INVALID_SOURCE_KEY');
      throw error;
    }
    if (!data || typeof data !== 'object') throw new Error('SOURCE_KEY_NOT_FOUND');

    return json(data);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'ACCOUNT_INACTIVE') return json({ error: code }, 423);
    if (code === 'SOURCE_KEY_NOT_FOUND') return json({ error: code }, 404);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_SOURCE', 'INVALID_ACTION', 'INVALID_SOURCE_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: code === 'INVALID_SOURCE' ? 'INVALID_SOURCE_KEY' : code }, 400);
    }
    console.error('manage-source-key', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
