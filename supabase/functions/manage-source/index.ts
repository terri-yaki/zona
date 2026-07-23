import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUser, service } from '../_shared/supabase.ts';
import { requiredString, uuid } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const sourceId = uuid(body.sourceId);
    const action = body.action;

    if (action === 'rename') {
      const displayName = requiredString(body.displayName, 80, 'INVALID_SOURCE');
      const { data, error } = await service.rpc('manage_source_internal', {
        p_user_id: user.id,
        p_source_id: sourceId,
        p_action: 'rename',
        p_display_name: displayName,
      });
      if (error) throw error;
      if (!data) return json({ error: 'SOURCE_NOT_FOUND' }, 404);
      return json(data, 200, { 'Cache-Control': 'no-store' });
    }

    if (action === 'revoke') {
      const { data, error } = await service.rpc('manage_source_internal', {
        p_user_id: user.id,
        p_source_id: sourceId,
        p_action: 'revoke',
        p_display_name: null,
      });
      if (error) throw error;
      if (!data) return json({ error: 'SOURCE_NOT_FOUND' }, 404);
      return json(data, 200, { 'Cache-Control': 'no-store' });
    }

    return json({ error: 'INVALID_ACTION' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (code === 'INVALID_ACTION') return json({ error: code }, 400);
    if (['INVALID_SOURCE', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_SOURCE' }, 400);
    console.error('manage-source', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
