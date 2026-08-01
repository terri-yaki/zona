import { createSourceToken, sha256 } from '../_shared/crypto.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { projectUrl, requireUserSession, service } from '../_shared/supabase.ts';
import { requiredString, uuid } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { user, sessionId } = await requireUserSession(req);
    const body = await readJson(req);
    const sourceId = uuid(body.sourceId);
    const keyLabel = requiredString(body.keyLabel, 80, 'INVALID_SOURCE_KEY');
    const token = createSourceToken();
    const tokenHash = await sha256(token);

    const { error: accountError } = await service.rpc('assert_account_session_active_internal', {
      p_user_id: user.id,
      p_session_id: sessionId,
    });
    if (accountError) {
      if (accountError.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
      if (accountError.message.includes('INVALID_SESSION')) throw new Error('UNAUTHORIZED');
      throw accountError;
    }

    const { data: accessKeyId, error } = await service.rpc('create_source_key_internal', {
      p_user_id: user.id,
      p_source_id: sourceId,
      p_key_label: keyLabel,
      p_token_hash: tokenHash,
      p_key_prefix: token.slice(0, 18),
    });
    if (error) {
      if (error.message.includes('SOURCE_NOT_FOUND')) throw new Error('SOURCE_NOT_FOUND');
      if (error.message.includes('SOURCE_KEY_LIMIT_REACHED')) throw new Error('SOURCE_KEY_LIMIT_REACHED');
      if (error.message.includes('ACCESS_KEY_LIMIT_REACHED')) throw new Error('ACCESS_KEY_LIMIT_REACHED');
      if (error.message.includes('CREATE_RATE_LIMITED')) throw new Error('CREATE_RATE_LIMITED');
      if (error.message.includes('SOURCE_CREATION_DISABLED')) throw new Error('SERVICE_UNAVAILABLE');
      if (error.message.includes('INVALID_SOURCE_KEY')) throw new Error('INVALID_SOURCE_KEY');
      throw error;
    }
    if (typeof accessKeyId !== 'string') throw new Error('CREATE_FAILED');

    return json(
      {
        sourceId,
        accessKeyId,
        keyLabel,
        token,
        ingestUrl: `${projectUrl()}/functions/v1/notify`,
      },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'ACCOUNT_INACTIVE') return json({ error: code }, 423);
    if (code === 'SOURCE_NOT_FOUND') return json({ error: code }, 404);
    if (code === 'SOURCE_KEY_LIMIT_REACHED') return json({ error: code }, 409);
    if (code === 'ACCESS_KEY_LIMIT_REACHED') return json({ error: code }, 409);
    if (code === 'CREATE_RATE_LIMITED') return json({ error: code }, 429, { 'Retry-After': '3600' });
    if (code === 'SERVICE_UNAVAILABLE') return json({ error: code }, 503, { 'Retry-After': '60' });
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_SOURCE', 'INVALID_SOURCE_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: 'INVALID_SOURCE_KEY' }, 400);
    }
    console.error('create-source-key', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
