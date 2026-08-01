import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { SourceAccessKey } from '@/types';

export async function listSources({ includeRevoked = true } = {}) {
  let query = supabase
    .from('notification_source_overview')
    .select('*')
    .order('created_at', { ascending: false });
  if (!includeRevoked) query = query.is('revoked_at', null);
  const { data, error } = await query;
  if (error) throw dataError(error, translate('error.loadTitle'));
  return (data ?? [])
    .map((row) => ({
      id: row.id,
      user_id: row.user_id,
      display_name: row.display_name,
      hostname: row.hostname,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      revoked_at: row.revoked_at,
      api_key: {
        id: row.access_key_id,
        user_id: row.user_id,
        source_id: row.id,
        name: row.access_key_name,
        key_prefix: row.key_prefix,
        is_active: row.is_active,
        created_at: row.access_key_created_at,
        updated_at: row.access_key_updated_at,
        last_used_at: row.access_key_last_used_at,
        expires_at: row.access_key_expires_at,
        revoked_at: row.access_key_revoked_at,
        sound_name: row.sound_name,
      },
    }))
    // Active keys first; revoked keys sink to the bottom (newest first within each group).
    .sort((left, right) => {
      const leftRevoked = left.revoked_at ? 1 : 0;
      const rightRevoked = right.revoked_at ? 1 : 0;
      if (leftRevoked !== rightRevoked) return leftRevoked - rightRevoked;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
}

export async function setApiKeySound(apiKeyId: string, soundName: import('@/types/database').NotificationSound) {
  const { error } = await supabase.rpc('update_source_notification_sound', {
    p_access_key_id: apiKeyId,
    p_sound_name: soundName,
  });
  if (error) {
    // 23514 = check_violation — usually the DB migration for new sound names is not applied yet.
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
    const detail = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message) : '';
    if (code === '23514' || /sound_name|check constraint/i.test(detail)) {
      throw dataError(
        error,
        'This sound is not allowed on the server yet. Apply migration 202607250003_remove_zona_sound_presets (supabase db push) and try again.',
      );
    }
    throw dataError(error, translate('sources.soundError'));
  }
}

export async function listSourceAccessKeys(sourceId: string): Promise<SourceAccessKey[]> {
  const { data, error } = await supabase
    .from('source_access_keys')
    .select('id,source_id,name,key_prefix,is_active,created_at,updated_at,last_used_at,expires_at,revoked_at')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false });
  if (error) throw dataError(error, translate('sourceKeys.loadError'));
  return (data ?? []) as SourceAccessKey[];
}
