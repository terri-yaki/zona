import { isUuid } from '../_shared/account-actions.ts';
import { sha256 } from '../_shared/crypto.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { service } from '../_shared/supabase.ts';
import { sessionIdFromVerifiedJwt } from '../_shared/verified-session.ts';

function createVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `zona_tx_${btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function optionalActor(req: Request) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return null;
  const sessionId = sessionIdFromVerifiedJwt(token, data.user.id);
  return sessionId ? { sessionId, userId: data.user.id } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const body = await readJson(req, 2_048);
    const action = typeof body.action === 'string' ? body.action : '';
    if (action === 'begin') {
      const actor = await optionalActor(req);
      if (!isUuid(body.installationId)) return json({ error: 'INVALID_AUTH_TRANSACTION' }, 400);
      const verifier = createVerifier();
      const { data, error } = await service.rpc('begin_auth_transaction_internal', {
        p_actor_user_id: actor?.userId ?? null,
        p_actor_session_id: actor?.sessionId ?? null,
        p_installation_id: body.installationId,
        p_intent: body.intent,
        p_provider: body.provider,
        p_state_hash: await sha256(verifier),
      });
      if (error) throw error;
      return json({ ...data, verifier }, 201, { 'Cache-Control': 'no-store' });
    }

    if (!isUuid(body.transactionId) || typeof body.verifier !== 'string') {
      return json({ error: 'INVALID_AUTH_TRANSACTION' }, 400);
    }
    if (action === 'cancel') {
      const { data, error } = await service.rpc('cancel_auth_transaction_internal', {
        p_transaction_id: body.transactionId,
        p_state_hash: await sha256(body.verifier),
      });
      if (error) throw error;
      return json({ cancelled: data === true }, 200, { 'Cache-Control': 'no-store' });
    }
    if (action !== 'consume') return json({ error: 'INVALID_AUTH_TRANSACTION' }, 400);
    if (!isUuid(body.installationId)) return json({ error: 'INVALID_AUTH_TRANSACTION' }, 400);
    const actor = await optionalActor(req);
    if (!actor) return json({ error: 'UNAUTHORIZED' }, 401);
    const { data, error } = await service.rpc('consume_auth_transaction_internal', {
      p_transaction_id: body.transactionId,
      p_user_id: actor.userId,
      p_session_id: actor.sessionId,
      p_installation_id: body.installationId,
      p_state_hash: await sha256(body.verifier),
    });
    if (error) throw error;
    return json(data, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message.includes('UNAUTHORIZED') || message.includes('INVALID_SESSION')) return json({ error: 'UNAUTHORIZED' }, 401);
    if (message.includes('AUTH_TRANSACTION_EXPIRED')) return json({ error: 'AUTH_TRANSACTION_EXPIRED' }, 410);
    if (message.includes('AUTH_TRANSACTION_IDENTITY_CONFLICT')) return json({ error: 'AUTH_TRANSACTION_IDENTITY_CONFLICT' }, 409);
    if (message === 'PAYLOAD_TOO_LARGE') return json({ error: message }, 413);
    if (message.includes('INVALID_AUTH_TRANSACTION') || ['CONTENT_TYPE', 'INVALID_JSON'].includes(message)) {
      return json({ error: 'INVALID_AUTH_TRANSACTION' }, 400);
    }
    console.error('auth-transaction', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
