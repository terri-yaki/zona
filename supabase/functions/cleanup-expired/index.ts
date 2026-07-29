import { sha256 } from '../_shared/crypto.ts';
import { json } from '../_shared/http.ts';
import { service } from '../_shared/supabase.ts';

type ExpiredAttachment = { id: string; attachment_path: string };
type DeletionJob = {
  job_id: string;
  account_id: string;
  user_id: string;
  job_status: 'pending' | 'running' | 'data_deleted' | 'failed';
  cleanup: Record<string, unknown>;
};

const batchSize = 100;
const maximumBatches = 10;

async function authorized(req: Request) {
  const expected = Deno.env.get('CLEANUP_SECRET');
  const provided = req.headers.get('x-cleanup-secret');
  if (!expected || !provided) return false;
  const [expectedHash, providedHash] = await Promise.all([sha256(expected), sha256(provided)]);
  return expectedHash === providedHash;
}

async function removeExpiredAttachments(now: string) {
  let removed = 0;
  for (let batch = 0; batch < maximumBatches; batch += 1) {
    const { data, error } = await service
      .from('inbox_notifications')
      .select('id, attachment_path')
      .lte('expires_at', now)
      .not('attachment_path', 'is', null)
      .order('expires_at', { ascending: true })
      .limit(batchSize);
    if (error) throw error;

    const rows = (data ?? []) as ExpiredAttachment[];
    if (rows.length === 0) break;
    const { error: storageError } = await service.storage
      .from('notification-attachments')
      .remove(rows.map((row) => row.attachment_path));
    if (storageError) throw storageError;

    const { error: deleteError } = await service
      .from('inbox_notifications')
      .delete()
      .in('id', rows.map((row) => row.id))
      .lte('expires_at', now);
    if (deleteError) throw deleteError;
    removed += rows.length;
    if (rows.length < batchSize) break;
  }
  return removed;
}

async function removeAccountAttachments(userId: string) {
  const bucket = service.storage.from('notification-attachments');
  let removed = 0;
  while (true) {
    const { data: files, error } = await bucket.list(userId, { limit: 1_000, offset: 0 });
    if (error) throw error;
    const paths = (files ?? []).filter((file) => file.id).map((file) => `${userId}/${file.name}`);
    if (paths.length === 0) return removed;
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
    removed += paths.length;
  }
}

function isMissingUser(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; message?: unknown };
  return value.status === 404 || (typeof value.message === 'string' && /user not found/i.test(value.message));
}

async function resumeAccountDeletions() {
  const { data, error } = await service.rpc('claim_account_deletion_jobs_internal', { p_limit: 10 });
  if (error) throw error;
  let completed = 0;

  for (const job of (data ?? []) as DeletionJob[]) {
    try {
      let cleanup = job.cleanup ?? {};
      if (job.job_status !== 'data_deleted') {
        const attachments = await removeAccountAttachments(job.user_id);
        const { data: deleted, error: cleanupError } = await service.rpc('delete_account_data_internal', {
          p_user_id: job.user_id,
        });
        if (cleanupError) throw cleanupError;
        cleanup = { ...(deleted ?? {}), attachments };
        const { error: checkpointError } = await service.rpc('mark_account_deletion_data_deleted_internal', {
          p_job_id: job.job_id,
          p_account_id: job.account_id,
          p_user_id: job.user_id,
          p_cleanup: cleanup,
        });
        if (checkpointError) throw checkpointError;
      }

      const { error: deleteError } = await service.auth.admin.deleteUser(job.user_id, false);
      if (deleteError && !isMissingUser(deleteError)) throw deleteError;
      const { error: completionError } = await service.rpc('complete_account_deletion_internal', {
        p_job_id: job.job_id,
        p_account_id: job.account_id,
        p_user_id: job.user_id,
        p_cleanup: cleanup,
      });
      if (completionError) throw completionError;
      completed += 1;
    } catch (jobError) {
      await service.rpc('fail_account_deletion_internal', {
        p_job_id: job.job_id,
        p_error_code: 'RESUME_FAILED',
      });
      console.error('account deletion resume failed', job.job_id, jobError);
    }
  }
  return completed;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!await authorized(req)) return json({ error: 'UNAUTHORIZED' }, 401);

  try {
    const now = new Date().toISOString();
    const attachments = await removeExpiredAttachments(now);
    const accountDeletions = await resumeAccountDeletions();
    return json({ attachments, accountDeletions }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('cleanup-expired', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
