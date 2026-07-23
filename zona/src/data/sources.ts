import { dataError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export async function listSources({ includeRevoked = true } = {}) {
  let query = supabase
    .from('source_api_keys')
    .select('*')
    .order('created_at', { ascending: false });
  if (!includeRevoked) query = query.is('revoked_at', null);
  const { data, error } = await query;
  if (error) throw dataError(error, 'Your API keys could not be loaded.');
  return (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    display_name: row.display_name,
    hostname: row.hostname,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    api_key: {
      id: row.api_key_id,
      user_id: row.user_id,
      source_id: row.id,
      name: row.api_key_name,
      key_prefix: row.key_prefix,
      is_active: row.is_active,
      created_at: row.key_created_at,
      updated_at: row.key_updated_at,
      last_used_at: row.key_last_used_at,
      expires_at: row.key_expires_at,
      revoked_at: row.key_revoked_at,
      sound_name: row.sound_name,
    },
  }));
}

export async function setApiKeySound(apiKeyId: string, soundName: 'default' | 'silent' | 'zona-soft.wav' | 'zona-bright.wav' | 'zona-urgent.wav') {
  const { error } = await supabase
    .from('api_keys')
    .update({ sound_name: soundName, updated_at: new Date().toISOString() })
    .eq('id', apiKeyId);
  if (error) throw dataError(error, 'The notification sound could not be saved.');
}
