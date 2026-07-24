import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { AppOptions } from '@/types';

export async function getAppOptions(userId: string): Promise<AppOptions> {
  const { error: createError } = await supabase
    .from('app_options')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (createError) throw dataError(createError, translate('settings.optionsLoadError'));

  const { data, error } = await supabase
    .from('app_options')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw dataError(error, translate('settings.optionsLoadError'));
  return data;
}

export type AppOptionFlags = Pick<
  AppOptions,
  'push_enabled' | 'play_sound' | 'show_preview' | 'live_activity_enabled'
>;

export async function updateAppOptions(
  userId: string,
  changes: Partial<AppOptionFlags>,
): Promise<AppOptions> {
  const { data, error } = await supabase
    .from('app_options')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw dataError(error, translate('settings.optionSaveError'));
  return data;
}
