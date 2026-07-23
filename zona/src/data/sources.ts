import { dataError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const sourceColumns = 'id,user_id,display_name,hostname,created_at,last_seen_at,revoked_at';

export async function listSources({ includeRevoked = true } = {}) {
  let query = supabase
    .from('sources')
    .select(sourceColumns)
    .order('created_at', { ascending: false });
  if (!includeRevoked) query = query.is('revoked_at', null);
  const { data, error } = await query;
  if (error) throw dataError(error, 'Your sources could not be loaded.');
  return data ?? [];
}
