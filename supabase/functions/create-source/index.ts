import { createSourceToken, sha256 } from '../_shared/crypto.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { projectUrl, requireUser, service } from '../_shared/supabase.ts';
import { optionalString, requiredString } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const displayName = requiredString(body.displayName, 80, 'INVALID_SOURCE');
    const hostname = optionalString(body.hostname, 255, 'INVALID_SOURCE');
    const token = createSourceToken();
    const tokenHash = await sha256(token);

    const { data: sourceId, error } = await service.rpc('create_source_internal', {
      p_user_id: user.id,
      p_display_name: displayName,
      p_hostname: hostname,
      p_key_prefix: token.slice(0, 18),
      p_token_hash: tokenHash,
    });
    if (error) {
      if (error.message.includes('SOURCE_LIMIT_REACHED')) throw new Error('SOURCE_LIMIT_REACHED');
      if (error.message.includes('CREATE_RATE_LIMITED')) throw new Error('CREATE_RATE_LIMITED');
      if (error.message.includes('SOURCE_CREATION_DISABLED')) throw new Error('SERVICE_UNAVAILABLE');
      if (error.message.includes('INVALID_SOURCE')) throw new Error('INVALID_SOURCE');
      throw error;
    }
    if (typeof sourceId !== 'string') throw new Error('CREATE_FAILED');

    return json(
      {
        sourceId,
        displayName,
        hostname,
        token,
        ingestUrl: `${projectUrl()}/functions/v1/notify`,
      },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'SOURCE_LIMIT_REACHED') return json({ error: code }, 409);
    if (code === 'CREATE_RATE_LIMITED') return json({ error: code }, 429, { 'Retry-After': '3600' });
    if (code === 'SERVICE_UNAVAILABLE') return json({ error: code }, 503, { 'Retry-After': '60' });
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_SOURCE', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_SOURCE' }, 400);
    console.error('create-source', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
