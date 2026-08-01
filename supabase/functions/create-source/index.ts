import { createSourceToken, sha256 } from '../_shared/crypto.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { projectUrl, requireUserSession, service } from '../_shared/supabase.ts';
import { optionalString, requiredString } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { user, sessionId } = await requireUserSession(req);
    const body = await readJson(req);
    const displayName = requiredString(body.displayName, 80, 'INVALID_SOURCE');
    const hostname = optionalString(body.hostname, 255, 'INVALID_SOURCE');
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

    const { data: created, error } = await service.rpc('create_source_with_key_internal', {
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
    if (
      !created ||
      typeof created !== 'object' ||
      typeof created.sourceId !== 'string' ||
      typeof created.accessKeyId !== 'string'
    ) throw new Error('CREATE_FAILED');

    return json(
      {
        sourceId: created.sourceId,
        accessKeyId: created.accessKeyId,
        displayName,
        hostname,
        keyLabel: displayName,
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
    if (code === 'SOURCE_LIMIT_REACHED') return json({ error: code }, 409);
    if (code === 'CREATE_RATE_LIMITED') return json({ error: code }, 429, { 'Retry-After': '3600' });
    if (code === 'SERVICE_UNAVAILABLE') return json({ error: code }, 503, { 'Retry-After': '60' });
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_SOURCE', 'INVALID_SOURCE_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: 'INVALID_SOURCE' }, 400);
    }
    console.error('create-source', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
