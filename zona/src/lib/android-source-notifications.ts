import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { sourceNotificationChannelId } from './source-notification-channel-id';
import { translate } from '@/i18n';
import type { Source } from '@/types';

export async function ensureAndroidSourceNotificationChannel(sourceId: string, displayName: string) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(sourceNotificationChannelId(sourceId), {
    name: `Zona · ${displayName}`,
    description: translate('sources.soundAndroidChannelDesc'),
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 180],
  });
}

export async function syncAndroidSourceNotificationChannels(sources: Source[]) {
  if (Platform.OS !== 'android') return;
  await Promise.all(sources
    .filter((source) => !source.revoked_at)
    .map((source) => ensureAndroidSourceNotificationChannel(source.id, source.display_name)));
}

export async function openAndroidSourceNotificationSettings(sourceId: string, displayName: string) {
  if (Platform.OS !== 'android') return;
  await ensureAndroidSourceNotificationChannel(sourceId, displayName);
  const packageName = Constants.expoConfig?.android?.package;
  if (!packageName) {
    await Linking.openSettings();
    return;
  }
  try {
    await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: packageName },
      { key: 'android.provider.extra.CHANNEL_ID', value: sourceNotificationChannelId(sourceId) },
    ]);
  } catch {
    await Linking.openSettings();
  }
}
