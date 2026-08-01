import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUserSession, service } from '../_shared/supabase.ts';
import { reauthGrantPattern } from '../_shared/validation.ts';

type DeleteBody = { confirmation?: unknown; expectedUserId?: unknown; reauthGrant?: unknown };

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

  let jobId: string | null = null;
  try {
    const { user, sessionId } = await requireUserSession(req);
    const body = await readJson(req, 1_024) as DeleteBody;
    if (body.confirmation !== 'DELETE') return json({ error: 'CONFIRMATION_REQUIRED' }, 400);
    if (body.expectedUserId !== undefined && body.expectedUserId !== user.id) {
      return json({ error: 'ACCOUNT_MISMATCH' }, 409);
    }
    if (!user.is_anonymous) {
      if (typeof body.reauthGrant !== 'string' || !reauthGrantPattern.test(body.reauthGrant)) {
        return json({ error: 'REAUTH_REQUIRED' }, 403, { 'Cache-Control': 'no-store' });
      }
      // Prove the grant is valid without burning it; consume only after the
      // deletion job exists so a failed begin leaves the grant reusable.
      const { error: reauthError } = await service.rpc('assert_account_reauth_grant_internal', {
        p_user_id: user.id,
        p_actor_session_id: sessionId,
        p_action: 'account.delete',
        p_target: '',
        p_grant: body.reauthGrant,
      });
      if (reauthError) return json({ error: 'REAUTH_REQUIRED' }, 403, { 'Cache-Control': 'no-store' });
    }

    const { data: deletion, error: beginError } = await service.rpc('begin_account_deletion_internal', {
      p_user_id: user.id,
      p_idempotency_key: `account-delete:${user.id}`,
    });
    if (beginError) throw beginError;
    jobId = typeof deletion?.jobId === 'string' ? deletion.jobId : null;
    const accountId = typeof deletion?.accountId === 'string' ? deletion.accountId : null;
    if (!jobId || !accountId) throw new Error('DELETE_JOB_INVALID');

    if (!user.is_anonymous) {
      const { error: consumeError } = await service.rpc('consume_account_reauth_grant_internal', {
        p_user_id: user.id,
        p_actor_session_id: sessionId,
        p_action: 'account.delete',
        p_target: '',
        p_grant: body.reauthGrant!,
      });
      if (consumeError) throw consumeError;
    }

    const attachments = await removeAccountAttachments(user.id);
    const { data: cleanup, error: cleanupError } = await service.rpc('delete_account_data_internal', {
      p_user_id: user.id,
    });
    if (cleanupError) throw cleanupError;

    const combinedCleanup = { ...(cleanup ?? {}), attachments };
    const { error: checkpointError } = await service.rpc('mark_account_deletion_data_deleted_internal', {
      p_job_id: jobId,
      p_account_id: accountId,
      p_user_id: user.id,
      p_cleanup: combinedCleanup,
    });
    if (checkpointError) throw checkpointError;

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;

    const { data: verification, error: verificationError } = await service.auth.admin.getUserById(user.id);
    if (verification.user) throw new Error('ACCOUNT_DELETE_NOT_CONFIRMED');
    if (verificationError && !isMissingUser(verificationError)) throw verificationError;

    const { error: completionError } = await service.rpc('complete_account_deletion_internal', {
      p_job_id: jobId,
      p_account_id: accountId,
      p_user_id: user.id,
      p_cleanup: combinedCleanup,
    });
    if (completionError) throw completionError;

    return json(
      {
        deleted: true,
        userId: user.id,
        jobId,
        status: 'completed',
        cleanup: combinedCleanup,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    if (jobId) {
      // Best-effort checkpoint: a secondary failure must not mask the
      // original error or skip the mapped responses below.
      try {
        await service.rpc('fail_account_deletion_internal', {
          p_job_id: jobId,
          p_error_code: 'DELETE_STEP_FAILED',
        });
      } catch (failError) {
        console.error('delete-account fail-checkpoint', failError);
      }
    }
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return json({ error: 'INVALID_PAYLOAD' }, 400);
    console.error('delete-account', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
