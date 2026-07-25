import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { translate } from '@/i18n';
import type { TranslationKey } from '@/i18n/en';
import {
  androidChannelSound,
  BUNDLED_SOUND_FILES,
  isNativeSoundId,
  NATIVE_SOUND_IDS,
  type NativeSoundId,
  previewContentSound,
  soundChannelId,
  soundLabelKeys,
} from '@/lib/notification-sound-map';
import type { NotificationSound } from '@/types/database';

export {
  BUNDLED_SOUND_FILES,
  type BundledSoundFile,
  isBundledSoundFile,
  isNativeSoundId,
  NATIVE_SOUND_IDS,
  type NativeSoundId,
  soundChannelId,
} from '@/lib/notification-sound-map';

/** Android channel names for the phone-native choices. */
const nativeSoundChannelKeys: Record<NativeSoundId, TranslationKey> = {
  'native-notification': 'sound.channelNativeNotification',
  'native-alarm': 'sound.channelNativeAlarm',
  'native-ringtone': 'sound.channelNativeRingtone',
};

let channelsReady: Promise<void> | null = null;

/**
 * Create Android notification channels for each custom sound.
 * iOS uses the bundled filename from the push payload directly (no channels).
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
    // Phone-native tones: the pinned expo-notifications resolves channel sounds
    // to bundled raw resources or the system default notification sound, so the
    // native channels use 'default' (exact for native-notification; documented
    // degradation for native-alarm / native-ringtone — see notification-sound-map.ts).
    for (const nativeId of NATIVE_SOUND_IDS) {
      await Notifications.setNotificationChannelAsync(soundChannelId(nativeId), {
        name: translate(nativeSoundChannelKeys[nativeId]),
        importance: Notifications.AndroidImportance.MAX,
        sound: androidChannelSound(nativeId),
        vibrationPattern: [0, 180],
      });
    }
    for (const file of BUNDLED_SOUND_FILES) {
      await Notifications.setNotificationChannelAsync(soundChannelId(file), {
        name: translate('sound.channelNamed', { name: file.replace(/\.wav$/i, '').replace(/^zona[_-]?/i, '') }),
        importance: Notifications.AndroidImportance.MAX,
        // Basename including extension — must match the file in the app bundle.
        sound: androidChannelSound(file),
        vibrationPattern: [0, 180],
      });
    }
  })().catch((error) => {
    channelsReady = null;
    console.warn('Could not register notification sound channels.', error);
  });

  return channelsReady;
}

/**
 * Play a local notification using the choice's mapped sound so the user can
 * hear the tone without waiting for a remote push (also verifies bundled
 * files are in the IPA). Native choices preview with the system default
 * sound — the only tone the OS exposes to apps for notifications.
 */
export async function previewNotificationSound(soundName: NotificationSound): Promise<void> {
  if (Platform.OS === 'web') return;

  await ensureNotificationSoundChannels();

  const body = soundName === 'silent'
    ? translate('sound.previewSilent')
    : soundName === 'default'
    ? translate('sound.previewDefault')
    : translate('sound.previewNamed', {
        name: isNativeSoundId(soundName) ? translate(soundLabelKeys[soundName]) : soundName,
      });

  await Notifications.scheduleNotificationAsync({
    content: {
      title: translate('sound.previewTitle'),
      body,
      sound: previewContentSound(soundName),
      ...(Platform.OS === 'android' ? { channelId: soundChannelId(soundName) } : {}),
    },
    trigger: null,
  });
}
