import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { translate } from '@/i18n';
import {
  androidChannelSound,
  previewContentSound,
  soundChannelId,
  soundLabelKeys,
} from '@/lib/notification-sound-map';
import type { NotificationSound } from '@/types/database';

export {
  BUNDLED_SOUND_FILES,
  type BundledSoundFile,
  IOS_TONE_FILES,
  type IosToneFile,
  isBundledSoundFile,
  isIosToneFile,
  soundChannelId,
} from '@/lib/notification-sound-map';

let channelsReady: Promise<void> | null = null;

/**
 * Create Android default and silent channels. iOS-only custom tones fall back
 * to the default channel; iOS plays their bundled filename without channels.
 */
export function ensureNotificationSoundChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (channelsReady) return channelsReady;

  channelsReady = (async () => {
    await Notifications.setNotificationChannelAsync('zona_default', {
      name: translate('sound.channelAlerts'),
      importance: Notifications.AndroidImportance.MAX,
      sound: androidChannelSound('default'),
      vibrationPattern: [0, 180],
    });
    await Notifications.setNotificationChannelAsync('zona_silent', {
      name: translate('sound.channelSilent'),
      importance: Notifications.AndroidImportance.DEFAULT,
      // Explicit null (no sound) — an omitted sound key would fall back to the
      // system default sound in expo-notifications' channel manager.
      sound: androidChannelSound('silent'),
      vibrationPattern: [0, 120],
    });
  })().catch((error) => {
    channelsReady = null;
    console.warn('Could not register notification sound channels.', error);
  });

  return channelsReady;
}

/**
 * Play a local notification using the choice's mapped sound so the user can
 * hear the tone without waiting for a remote push (also verifies bundled
 * files are in the build).
 */
export async function previewNotificationSound(soundName: NotificationSound): Promise<void> {
  if (Platform.OS === 'web') return;

  await ensureNotificationSoundChannels();

  const usesAndroidFallback = Platform.OS === 'android' && soundName !== 'default' && soundName !== 'silent';
  const body = soundName === 'silent'
    ? translate('sound.previewSilent')
    : soundName === 'default' || usesAndroidFallback
    ? translate('sound.previewDefault')
    : translate('sound.previewNamed', { name: translate(soundLabelKeys[soundName]) });
  const contentSound = Platform.OS === 'android'
    ? androidChannelSound(soundName) ?? false
    : previewContentSound(soundName);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: translate('sound.previewTitle'),
      body,
      sound: contentSound,
      ...(Platform.OS === 'android' ? { channelId: soundChannelId(soundName) } : {}),
    },
    trigger: null,
  });
}
