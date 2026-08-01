import { bearerValue, isUuid } from '../_shared/account-actions.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUserSession, service } from '../_shared/supabase.ts';
import { sessionIdFromVerifiedJwt } from '../_shared/verified-session.ts';

type DestinationProof = { sessionId: string; token: string; userId: string };

async function requireDestination(req: Request, sourceUserId: string): Promise<DestinationProof> {
  const token = bearerValue(req.headers.get('x-destination-token'));
  if (!token) throw new Error('DESTINATION_PROOF_REQUIRED');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('DESTINATION_PROOF_REQUIRED');
  if (data.user.id === sourceUserId) throw new Error('SAME_ACCOUNT');
  if (data.user.is_anonymous) throw new Error('DESTINATION_NOT_PROTECTED');
  const sessionId = sessionIdFromVerifiedJwt(token, data.user.id);
  if (!sessionId) throw new Error('DESTINATION_PROOF_REQUIRED');
  return { sessionId, token, userId: data.user.id };
}

async function listAttachmentNames(userId: string) {
  const names: string[] = [];
  const bucket = service.storage.from('notification-attachments');
  for (let offset = 0;; offset += 1_000) {
    const { data, error } = await bucket.list(userId, {
      limit: 1_000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    const page = (data ?? []).filter((file) => file.id).map((file) => file.name);
    names.push(...page);
    if (page.length < 1_000) return names;
  }
}

async function stageAttachments(sourceUserId: string, destinationUserId: string) {
  const bucket = service.storage.from('notification-attachments');
  const names = await listAttachmentNames(sourceUserId);
  const staged: string[] = [];
  try {
    for (const name of names) {
      const { data: blob, error: downloadError } = await bucket.download(`${sourceUserId}/${name}`);
      if (downloadError) throw downloadError;
      const destinationPath = `${destinationUserId}/${name}`;
      const { error: uploadError } = await bucket.upload(destinationPath, blob, {
        contentType: blob.type || undefined,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      staged.push(destinationPath);
    }
    return { names, staged };
  } catch (error) {
    if (staged.length) await bucket.remove(staged).catch(() => undefined);
    throw error;
  }
}

async function cleanupGuestAuth(sourceUserId: string) {
  const { error: deleteError } = await service.auth.admin.deleteUser(sourceUserId, false);
  return Boolean(deleteError);
}

async function transferAttachmentsAndAuth(sourceUserId: string, destinationUserId: string) {
  // Stage after commit so transfer_locked blocks concurrent notify uploads from
  // creating un-copied objects that path rewrite would orphan, then source cleanup
  // would delete the only remaining Storage bytes.
  const staged = await stageAttachments(sourceUserId, destinationUserId);
  if (staged.names.length) {
    await service.storage.from('notification-attachments')
      .remove(staged.names.map((name) => `${sourceUserId}/${name}`))
      .catch((error) => console.error('account-transfer old attachment cleanup', error));
  }
  const authCleanupPending = await cleanupGuestAuth(sourceUserId);
  return { attachmentsTransferred: staged.names.length, authCleanupPending };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const source = await requireUserSession(req);
    if (!source.user.is_anonymous) return json({ error: 'SOURCE_NOT_GUEST' }, 409);
    const body = await readJson(req, 4_096);
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'cancel') {
      if (!isUuid(body.transferId)) return json({ error: 'INVALID_TRANSFER_REQUEST' }, 400);
      const { data, error } = await service.rpc('cancel_account_transfer_internal', {
        p_transfer_id: body.transferId,
        p_source_user_id: source.user.id,
      });
      if (error) throw error;
      return json({ cancelled: data === true, transferId: body.transferId }, 200, { 'Cache-Control': 'no-store' });
    }

    const destination = await requireDestination(req, source.user.id);
    if (action === 'preview') {
      const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
      if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
        return json({ error: 'INVALID_TRANSFER_REQUEST' }, 400);
      }
      const { data, error } = await service.rpc('begin_account_transfer_internal', {
        p_source_user_id: source.user.id,
        p_source_session_id: source.sessionId,
        p_destination_user_id: destination.userId,
        p_destination_session_id: destination.sessionId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return json(data, 200, { 'Cache-Control': 'no-store' });
    }

    if (action !== 'commit' || !isUuid(body.transferId) || !isUuid(body.installationId)) {
      return json({ error: 'INVALID_TRANSFER_REQUEST' }, 400);
    }
    const { data: job, error: jobError } = await service.rpc('get_account_transfer_internal', {
      p_transfer_id: body.transferId,
      p_source_user_id: source.user.id,
      p_destination_user_id: destination.userId,
    });
    if (jobError) throw jobError;
    if (job?.status === 'completed') {
      // Re-commit repairs attachment staging + guest Auth cleanup if a prior
      // attempt finished the SQL transfer but failed post-commit work.
      const repair = await transferAttachmentsAndAuth(source.user.id, destination.userId);
      return json({ ...job, ...repair }, 200, { 'Cache-Control': 'no-store' });
    }

    const { data, error } = await service.rpc('commit_account_transfer_internal', {
      p_transfer_id: body.transferId,
      p_source_user_id: source.user.id,
      p_destination_user_id: destination.userId,
      p_source_installation_id: body.installationId,
    });
    if (error) throw error;

    const post = await transferAttachmentsAndAuth(source.user.id, destination.userId);
    return json(
      {
        ...data,
        ...post,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'UNAUTHORIZED') return json({ error: message }, 401);
    if (message.includes('DESTINATION_PROOF_REQUIRED')) return json({ error: 'DESTINATION_PROOF_REQUIRED' }, 403);
    if (message.includes('SOURCE_NOT_GUEST') || message.includes('DESTINATION_NOT_PROTECTED') || message.includes('SAME_ACCOUNT')) {
      return json({ error: message.replace(/^.*(SOURCE_NOT_GUEST|DESTINATION_NOT_PROTECTED|SAME_ACCOUNT).*$/, '$1') }, 409);
    }
    if (message.includes('TRANSFER_NOT_FOUND')) return json({ error: 'TRANSFER_NOT_FOUND' }, 404);
    if (message.includes('TRANSFER_LIMIT_CONFLICT')) return json({ error: 'TRANSFER_LIMIT_CONFLICT' }, 409);
    if (message.includes('TRANSFER_NOT_READY') || message.includes('ACCOUNT_INACTIVE')) {
      return json({ error: 'TRANSFER_NOT_READY' }, 409);
    }
    if (message === 'PAYLOAD_TOO_LARGE') return json({ error: message }, 413);
    if (['CONTENT_TYPE', 'INVALID_JSON'].includes(message)) return json({ error: 'INVALID_TRANSFER_REQUEST' }, 400);
    console.error('account-transfer', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
