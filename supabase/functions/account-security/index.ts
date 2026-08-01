import { parseAccountAction, parseActionTarget } from '../_shared/account-actions.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { projectUrl, requireUserSession, service } from '../_shared/supabase.ts';

function authHeaders(accessToken: string) {
  const apiKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!apiKey) throw new Error('SERVER_CONFIGURATION');
  return { apikey: apiKey, Authorization: `Bearer ${accessToken}` };
}

/** Validate a grant without consuming it. */
async function assertGrant(
  userId: string,
  sessionId: string,
  action: string,
  target: string,
  grant: string,
) {
  const { error } = await service.rpc('assert_account_reauth_grant_internal', {
    p_user_id: userId,
    p_actor_session_id: sessionId,
    p_action: action,
    p_target: target,
    p_grant: grant,
  });
  if (error) throw error;
}

/** Mark a previously asserted grant as used. */
async function consumeGrant(
  userId: string,
  sessionId: string,
  action: string,
  target: string,
  grant: string,
) {
  const { error } = await service.rpc('consume_account_reauth_grant_internal', {
    p_user_id: userId,
    p_actor_session_id: sessionId,
    p_action: action,
    p_target: target,
    p_grant: grant,
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const actor = await requireUserSession(req);
    const body = await readJson(req, 2_048);
    const action = parseAccountAction(body.action);
    const target = action ? parseActionTarget(action, body.target) : null;
    const grant = typeof body.grant === 'string' ? body.grant : null;
    if (!action || action === 'account.delete' || target === null || !grant) {
      return json({ error: 'INVALID_SECURITY_ACTION' }, 400);
    }

    // Cheap action-specific checks first so bad client targets never touch the grant.
    if (action === 'identity.unlink') {
      const identities = actor.user.identities ?? [];
      if (identities.length <= 1) return json({ error: 'FINAL_IDENTITY' }, 409);
      if (!identities.some((identity) => identity.identity_id === target)) {
        return json({ error: 'IDENTITY_NOT_FOUND' }, 404);
      }
    }

    // Prove the grant is currently valid without burning it, then run the side
    // effect, then consume. Failed Auth/RPC side effects leave the grant reusable.
    await assertGrant(actor.user.id, actor.sessionId, action, target, grant);

    if (action === 'identity.link') {
      await consumeGrant(actor.user.id, actor.sessionId, action, target, grant);
      return json({ action, approved: true, target }, 200, { 'Cache-Control': 'no-store' });
    }

    if (action === 'identity.unlink') {
      const response = await fetch(`${projectUrl()}/auth/v1/user/identities/${target}`, {
        method: 'DELETE',
        headers: authHeaders(actor.accessToken),
      });
      if (!response.ok) {
        console.error('account-security unlink', response.status, await response.text());
        return json({ error: 'IDENTITY_UNLINK_FAILED' }, response.status === 422 ? 409 : 502);
      }
      await consumeGrant(actor.user.id, actor.sessionId, action, target, grant);
      return json({ action, identityId: target, unlinked: true }, 200, { 'Cache-Control': 'no-store' });
    }

    if (action === 'installation.revoke') {
      const { data, error } = await service.rpc('revoke_account_installation_internal', {
        p_user_id: actor.user.id,
        p_actor_session_id: actor.sessionId,
        p_installation_id: target,
      });
      if (error) throw error;
      await consumeGrant(actor.user.id, actor.sessionId, action, target, grant);
      return json(data, 200, { 'Cache-Control': 'no-store' });
    }

    const scope = action === 'sessions.revoke.all' ? 'all' : 'others';
    // Consume before revoking: scope 'all' revokes the actor session itself, and the
    // consume RPC requires a still-active actor session.
    await consumeGrant(actor.user.id, actor.sessionId, action, target, grant);
    // Kill Auth refresh tokens up front; the Zona-side revocation below runs on the
    // service role and is unaffected by the actor's Auth session dying.
    const { error: signOutError } = await service.auth.admin.signOut(
      actor.accessToken,
      scope === 'all' ? 'global' : 'others',
    );
    if (signOutError) console.error('account-security signOut', signOutError);
    const { data, error } = await service.rpc('revoke_account_sessions_internal', {
      p_user_id: actor.user.id,
      p_actor_session_id: actor.sessionId,
      p_scope: scope,
    });
    if (error) throw error;
    return json(data, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'UNAUTHORIZED') return json({ error: message }, 401);
    if (message.includes('REAUTH_REQUIRED')) return json({ error: 'REAUTH_REQUIRED' }, 403);
    if (message.includes('CURRENT_INSTALLATION')) return json({ error: 'CURRENT_INSTALLATION' }, 409);
    if (message.includes('INSTALLATION_NOT_FOUND')) return json({ error: 'INSTALLATION_NOT_FOUND' }, 404);
    if (message === 'PAYLOAD_TOO_LARGE') return json({ error: message }, 413);
    if (['CONTENT_TYPE', 'INVALID_JSON'].includes(message)) return json({ error: 'INVALID_SECURITY_ACTION' }, 400);
    console.error('account-security', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
