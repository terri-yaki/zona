import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { getInstallationId } from '@/lib/push';
import { parseRuntimeSnapshot, type RuntimeSnapshot } from '@/lib/runtime-controls';
import { supabase } from '@/lib/supabase';
import type { SupportedLanguage } from '@/i18n';

export type AppBootstrapContext = {
  appVersion: string;
  buildNumber: number;
  installationId: string;
  locale: SupportedLanguage;
  platform: 'android' | 'ios' | 'web';
  releaseChannel: 'production' | 'preview' | 'development';
};

function releaseChannel(): 'production' | 'preview' | 'development' {
  if (__DEV__) return 'development';
  return Updates.channel === 'preview' ? 'preview' : 'production';
}

function buildNumber(): number {
  const parsed = Number.parseInt(Constants.nativeBuildVersion ?? '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getAppBootstrapContext(language: SupportedLanguage): Promise<AppBootstrapContext> {
  return {
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    buildNumber: buildNumber(),
    installationId: await getInstallationId(),
    locale: language,
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    releaseChannel: releaseChannel(),
  };
}

export function appBootstrapCacheVariant(context: AppBootstrapContext) {
  return [
    context.platform,
    context.appVersion,
    context.buildNumber,
    context.releaseChannel,
    context.locale,
    context.installationId,
  ].join('|');
}

export async function fetchAppBootstrap(
  language: SupportedLanguage,
  context?: AppBootstrapContext,
): Promise<RuntimeSnapshot> {
  const resolvedContext = context ?? await getAppBootstrapContext(language);
  const { data, error } = await supabase.rpc('get_app_bootstrap', {
    p_platform: resolvedContext.platform,
    p_app_version: resolvedContext.appVersion,
    p_build_number: resolvedContext.buildNumber,
    p_release_channel: resolvedContext.releaseChannel,
    p_locale: resolvedContext.locale,
    p_installation_id: resolvedContext.installationId,
  });
  if (error) throw error;
  return parseRuntimeSnapshot(data);
}
