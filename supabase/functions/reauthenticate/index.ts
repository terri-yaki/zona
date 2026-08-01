import { bearerValue, mostRecentProofIdentity, parseAccountAction, parseActionTarget } from '../_shared/account-actions.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUserSession, service } from '../_shared/supabase.ts';
import { sessionIdFromVerifiedJwt } from '../_shared/verified-session.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  let proofToken: string | null = null;
  try {
    const actor = await requireUserSession(req);
    const body = await readJson(req, 2_048);
    const action = parseAccountAction(body.action);
    const target = action ? parseActionTarget(action, body.target) : null;
    proofToken = bearerValue(req.headers.get('x-reauth-token'));
    const installationId = typeof body.installationId === 'string' && uuidPattern.test(body.installationId) ? body.installationId : null;
    if (!action || target === null || !proofToken) return json({ error: 'INVALID_REAUTH_REQUEST' }, 400);

    const { data: proofData, error: proofError } = await service.auth.getUser(proofToken);
    if (proofError || !proofData.user) return json({ error: 'FRESH_PROOF_REQUIRED' }, 403);
    if (proofData.user.id !== actor.user.id) return json({ error: 'IDENTITY_CONFLICT' }, 409);
    const proofSessionId = sessionIdFromVerifiedJwt(proofToken, proofData.user.id);
    if (!proofSessionId || proofSessionId === actor.sessionId) {
      return json({ error: 'FRESH_PROOF_REQUIRED' }, 403);
    }
    const proofIdentity = mostRecentProofIdentity(proofData.user.identities);
    if (!proofIdentity?.identity_id) return json({ error: 'FRESH_PROOF_REQUIRED' }, 403);
    if (action === 'identity.unlink' && proofIdentity.identity_id === target) {
      return json({ error: 'REMAINING_IDENTITY_PROOF_REQUIRED' }, 403);
    }

    const { data, error } = await service.rpc('issue_account_reauth_grant_internal', {
      p_user_id: actor.user.id,
      p_actor_session_id: actor.sessionId,
      p_proof_session_id: proofSessionId,
      p_proof_identity_id: proofIdentity.identity_id,
      p_installation_id: installationId,
      p_action: action,
      p_target: target,
    });
    if (error) throw error;
    await service.auth.admin.signOut(proofToken, 'local');
    proofToken = null;
    return json(data, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    if (proofToken) await service.auth.admin.signOut(proofToken, 'local').catch(() => undefined);
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'UNAUTHORIZED') return json({ error: message }, 401);
    if (message.includes('REMAINING_IDENTITY_PROOF_REQUIRED')) {
      return json({ error: 'REMAINING_IDENTITY_PROOF_REQUIRED' }, 403);
    }
    if (message.includes('FRESH_PROOF_REQUIRED') || message.includes('REAUTH_NOT_AVAILABLE')) {
      return json({ error: 'FRESH_PROOF_REQUIRED' }, 403);
    }
    if (message.includes('INVALID_INSTALLATION')) return json({ error: 'INVALID_INSTALLATION' }, 409);
    if (message === 'PAYLOAD_TOO_LARGE') return json({ error: message }, 413);
    if (['CONTENT_TYPE', 'INVALID_JSON'].includes(message)) return json({ error: 'INVALID_REAUTH_REQUEST' }, 400);
    console.error('reauthenticate', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
