import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationSound } from '@/types/database';

/** Bundled custom sounds (must match app.json expo-notifications plugin list). */
export const BUNDLED_SOUND_FILES = [
  'zona-soft.wav',
  'zona-bright.wav',
  'zona-urgent.wav',
  'zona-chime.wav',
  'zona-crystal.wav',
  'zona-warm.wav',
  'zona-pulse.wav',
  'zona-signal.wav',
  'zona-bloom.wav',
] as const;

export type BundledSoundFile = (typeof BUNDLED_SOUND_FILES)[number];

export function isBundledSoundFile(value: string): value is BundledSoundFile {
  return (BUNDLED_SOUND_FILES as readonly string[]).includes(value);
}

/** Android channel id for a sound choice (must match server push channelId). */
export function soundChannelId(soundName: NotificationSound | string | null): string {
  if (!soundName || soundName === 'silent') return 'zona_silent';
  if (soundName === 'default') return 'zona_default';
  // zona-soft.wav → zona_soft
  return soundName.replace(/\.wav$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

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
      name: 'Zona alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 180],
    });
    await Notifications.setNotificationChannelAsync('zona_silent', {
      name: 'Zona silent',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: undefined,
      vibrationPattern: [0, 120],
    });
    for (const file of BUNDLED_SOUND_FILES) {
      await Notifications.setNotificationChannelAsync(soundChannelId(file), {
        name: `Zona ${file.replace(/\.wav$/i, '').replace(/^zona[_-]?/i, '')}`,
        importance: Notifications.AndroidImportance.MAX,
        // Basename including extension — must match the file in the app bundle.
        sound: file,
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
 * Play a local notification using a bundled sound so the user can hear the
 * ringtone without waiting for a remote push (also verifies the file is in the IPA).
 */
export async function previewNotificationSound(soundName: NotificationSound): Promise<void> {
  if (Platform.OS === 'web') return;

  await ensureNotificationSoundChannels();

  if (soundName === 'silent') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Zona sound preview',
        body: 'Silent — no tone for this source.',
        sound: false,
        ...(Platform.OS === 'android' ? { channelId: 'zona_silent' } : {}),
      },
      trigger: null,
    });
    return;
  }

  const sound = soundName === 'default' ? true : soundName;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Zona sound preview',
      body: soundName === 'default' ? 'System default tone.' : `Playing ${soundName}`,
      sound,
      ...(Platform.OS === 'android' ? { channelId: soundChannelId(soundName) } : {}),
    },
    trigger: null,
  });
}
