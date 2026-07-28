import { sha256 } from '../_shared/crypto.ts';
import { json } from '../_shared/http.ts';
import { service } from '../_shared/supabase.ts';

type ExpiredAttachment = { id: string; attachment_path: string };

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!await authorized(req)) return json({ error: 'UNAUTHORIZED' }, 401);

  try {
    const now = new Date().toISOString();
    const attachments = await removeExpiredAttachments(now);
    return json({ attachments }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('cleanup-expired', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
