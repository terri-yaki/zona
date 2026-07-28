import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { AppOptions } from '@/types';

export async function getAppOptions(_userId: string): Promise<AppOptions> {
  const { data, error } = await supabase.rpc('get_user_notification_preferences');
  if (error) throw dataError(error, translate('settings.optionsLoadError'));
  return data as unknown as AppOptions;
}

export type AppOptionFlags = Pick<
  AppOptions,
  'push_enabled' | 'play_sound' | 'show_preview' | 'live_activity_enabled'
>;

export async function updateAppOptions(
  _userId: string,
  changes: Partial<AppOptionFlags>,
): Promise<AppOptions> {
  const { data, error } = await supabase.rpc('update_user_notification_preferences', {
    p_push_enabled: changes.push_enabled ?? null,
    p_play_sound: changes.play_sound ?? null,
    p_show_preview: changes.show_preview ?? null,
    p_live_activity_enabled: changes.live_activity_enabled ?? null,
  });
  if (error) throw dataError(error, translate('settings.optionSaveError'));
  return data as unknown as AppOptions;
}
