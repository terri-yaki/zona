import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUser, service } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    const body = await readJson(req, 1_024);
    if (body.confirmation !== 'DELETE') return json({ error: 'CONFIRMATION_REQUIRED' }, 400);

    // Remove child data in a deterministic order before deleting auth.users.
    // This also makes a retry safe if the Auth Admin call is temporarily down.
    const { error: cleanupError } = await service.rpc('delete_account_data_internal', {
      p_user_id: user.id,
    });
    if (cleanupError) throw cleanupError;

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;

    return json({ deleted: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_PAYLOAD' }, 400);
    console.error('delete-account', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
