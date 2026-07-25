import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUser, service } from '../_shared/supabase.ts';

type DeleteBody = { confirmation?: unknown; expectedUserId?: unknown };

function isMissingUser(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: unknown; status?: unknown };
  return candidate.status === 404 ||
    (typeof candidate.message === 'string' && /user not found/i.test(candidate.message));
}

async function removeAccountAttachments(userId: string) {
  const bucket = service.storage.from('notification-attachments');
  let removed = 0;

  // Removing each first page means the next list call starts at zero again.
  while (true) {
    const { data: files, error: listError } = await bucket.list(userId, {
      limit: 1_000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (listError) throw listError;
    if (!files?.length) return removed;

    const paths = files
      .filter((file) => file.id)
      .map((file) => `${userId}/${file.name}`);
    if (!paths.length) return removed;

    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
    removed += paths.length;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    const body = await readJson(req, 1_024) as DeleteBody;
    if (body.confirmation !== 'DELETE') return json({ error: 'CONFIRMATION_REQUIRED' }, 400);
    if (body.expectedUserId !== undefined && body.expectedUserId !== user.id) {
      return json({ error: 'ACCOUNT_MISMATCH' }, 409);
    }

    const attachments = await removeAccountAttachments(user.id);
    const { data: cleanup, error: cleanupError } = await service.rpc('delete_account_data_internal', {
      p_user_id: user.id,
    });
    if (cleanupError) throw cleanupError;

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;

    const { data: verification, error: verificationError } = await service.auth.admin.getUserById(user.id);
    if (verification.user) throw new Error('ACCOUNT_DELETE_NOT_CONFIRMED');
    if (verificationError && !isMissingUser(verificationError)) throw verificationError;

    return json(
      {
        deleted: true,
        userId: user.id,
        cleanup: { ...(cleanup ?? {}), attachments },
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_PAYLOAD' }, 400);
    console.error('delete-account', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
