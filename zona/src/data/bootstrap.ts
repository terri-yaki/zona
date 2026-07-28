import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { getInstallationId } from '@/lib/push';
import { parseRuntimeSnapshot, type RuntimeSnapshot } from '@/lib/runtime-controls';
import { supabase } from '@/lib/supabase';
import type { SupportedLanguage } from '@/i18n';

function releaseChannel(): 'production' | 'preview' | 'development' {
  if (__DEV__) return 'development';
  return Updates.channel === 'preview' ? 'preview' : 'production';
}

function buildNumber(): number {
  const parsed = Number.parseInt(Constants.nativeBuildVersion ?? '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function fetchAppBootstrap(language: SupportedLanguage): Promise<RuntimeSnapshot> {
  const { data, error } = await supabase.rpc('get_app_bootstrap', {
    p_platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    p_app_version: Constants.expoConfig?.version ?? '0.0.0',
    p_build_number: buildNumber(),
    p_release_channel: releaseChannel(),
    p_locale: language,
    p_installation_id: await getInstallationId(),
  });
  if (error) throw error;
  return parseRuntimeSnapshot(data);
}
