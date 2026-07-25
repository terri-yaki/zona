import type { TranslationKey } from '../i18n/en';
import type { NotificationSound } from '../types/database';

/**
 * Pure mapping from a stored `api_keys.sound_name` choice to the concrete
 * sound inputs for (a) the local preview notification, (b) the Expo push
 * payload, and (c) the Android notification channel. No React Native or
 * network imports — the server (`supabase/functions/_shared/push.ts`) mirrors
 * the identifier set and channel-id rule and both sides are unit-tested.
 */

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

/** Stored identifiers for the phone's own tones, selectable in the picker. */
export const NATIVE_SOUND_IDS = ['native-notification', 'native-alarm', 'native-ringtone'] as const;

export type NativeSoundId = (typeof NATIVE_SOUND_IDS)[number];

export function isNativeSoundId(value: string): value is NativeSoundId {
  return (NATIVE_SOUND_IDS as readonly string[]).includes(value);
}

/**
 * Concrete `sound` value for the Expo push payload.
 *
 * APNs accepts only `default` or an audio file bundled in the app, and the
 * pinned Android client resolves payload sounds to bundled raw resources or
 * the system default — neither platform lets a third-party app play the
 * phone's alarm/ringtone tones for a notification. Native choices therefore
 * travel as `default`: the exact system notification sound for
 * `native-notification`, and the documented honest degradation for
 * `native-alarm` / `native-ringtone`. On Android 8+ the channel (see
 * `soundChannelId` / `androidChannelSound`) carries the effective tone.
 */
export function pushPayloadSound(soundName: NotificationSound): string | null {
  if (soundName === 'silent') return null;
  if (soundName === 'default' || isNativeSoundId(soundName)) return 'default';
  return soundName;
}

/**
 * Sound passed to `setNotificationChannelAsync` for a stored choice.
 *
 * The pinned expo-notifications `SoundResolver` maps channel sounds to
 * bundled raw resources only, falling back to the system default notification
 * sound for anything else — system alarm/ringtone URIs are not expressible
 * without unvetted native code. Native choices honestly map to `'default'`
 * (the phone's notification sound; exact for `native-notification`), and
 * `silent` maps to `null` (no sound).
 */
export function androidChannelSound(soundName: NotificationSound): string | null {
  if (soundName === 'silent') return null;
  if (soundName === 'default' || isNativeSoundId(soundName)) return 'default';
  return soundName;
}

/**
 * `sound` value for the local preview notification content: `true` plays the
 * system default sound, `false` plays none, and bundled filenames play the
 * file itself. Native choices resolve to `true` (same mapping as the push
 * payload — exact for the phone's notification sound, the documented
 * degradation for alarm/ringtone). On Android the channel sound governs.
 */
export function previewContentSound(soundName: NotificationSound): string | boolean {
  if (soundName === 'silent') return false;
  if (soundName === 'default' || isNativeSoundId(soundName)) return true;
  return soundName;
}

/** Android channel id for a sound choice (must match server push channelId). */
export function soundChannelId(soundName: NotificationSound | string | null): string {
  if (!soundName || soundName === 'silent') return 'zona_silent';
  if (soundName === 'default') return 'zona_default';
  // zona-soft.wav → zona_soft; native-alarm → zona_native_alarm
  const slug = soundName.replace(/\.wav$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return slug.startsWith('zona_') ? slug : `zona_${slug}`;
}

/** Picker rows in display order: special, phone-native, bundled, silent last. */
export const SOUND_CHOICES: readonly NotificationSound[] = [
  'default',
  ...NATIVE_SOUND_IDS,
  ...BUNDLED_SOUND_FILES,
  'silent',
];

export const soundLabelKeys: Record<NotificationSound, TranslationKey> = {
  default: 'sources.soundDefault',
  silent: 'sources.soundSilent',
  'native-notification': 'sources.soundNativeNotification',
  'native-alarm': 'sources.soundNativeAlarm',
  'native-ringtone': 'sources.soundNativeRingtone',
  'zona-soft.wav': 'sources.soundSoft',
  'zona-bright.wav': 'sources.soundBright',
  'zona-urgent.wav': 'sources.soundUrgent',
  'zona-chime.wav': 'sources.soundChime',
  'zona-crystal.wav': 'sources.soundCrystal',
  'zona-warm.wav': 'sources.soundWarm',
  'zona-pulse.wav': 'sources.soundPulse',
  'zona-signal.wav': 'sources.soundSignal',
  'zona-bloom.wav': 'sources.soundBloom',
};

export const soundDescriptionKeys: Record<NotificationSound, TranslationKey> = {
  default: 'sources.soundDefaultDesc',
  silent: 'sources.soundSilentDesc',
  'native-notification': 'sources.soundNativeNotificationDesc',
  'native-alarm': 'sources.soundNativeAlarmDesc',
  'native-ringtone': 'sources.soundNativeRingtoneDesc',
  'zona-soft.wav': 'sources.soundSoftDesc',
  'zona-bright.wav': 'sources.soundBrightDesc',
  'zona-urgent.wav': 'sources.soundUrgentDesc',
  'zona-chime.wav': 'sources.soundChimeDesc',
  'zona-crystal.wav': 'sources.soundCrystalDesc',
  'zona-warm.wav': 'sources.soundWarmDesc',
  'zona-pulse.wav': 'sources.soundPulseDesc',
  'zona-signal.wav': 'sources.soundSignalDesc',
  'zona-bloom.wav': 'sources.soundBloomDesc',
};
