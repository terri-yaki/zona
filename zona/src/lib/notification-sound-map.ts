import type { TranslationKey } from '../i18n/en';
import type { NotificationSound } from '../types/database';

/**
 * Pure mapping from a stored `api_keys.sound_name` choice to the concrete
 * sound inputs for (a) the local preview notification, (b) the Expo push
 * payload, and (c) the Android notification channel. No React Native or
 * network imports — the server (`supabase/functions/_shared/push.ts`) mirrors
 * the identifier set and channel-id rule and both sides are unit-tested.
 */

/**
 * Zona's own synthesized presets (assets/sounds/zona-*.wav), kept in sync with
 * the app.json expo-notifications plugin list by unit tests.
 */
export const ZONA_SOUND_FILES = [
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

/**
 * iPhone alert tones bundled with the app (assets/sounds/ios-*.wav), listed in
 * the same order as the iOS-style picker the feature mirrors. iOS gives apps
 * no API to reference the phone's system tones, so (like Slack et al.) the
 * tones are bundled audio files that APNs plays by basename. Provenance and
 * licensing are documented in CHANGELOG.md.
 */
export const IOS_TONE_FILES = [
  'ios-note.wav',
  'ios-aurora.wav',
  'ios-bamboo.wav',
  'ios-chord.wav',
  'ios-circles.wav',
  'ios-complete.wav',
  'ios-hello.wav',
  'ios-input.wav',
  'ios-keys.wav',
  'ios-popcorn.wav',
  'ios-pulse.wav',
  'ios-synth.wav',
  'ios-bell-tower.wav',
  'ios-boing.wav',
  'ios-glass.wav',
  'ios-harp.wav',
] as const;

export type IosToneFile = (typeof IOS_TONE_FILES)[number];

/** Every sound file bundled in the app (iPhone tones + Zona presets). */
export const BUNDLED_SOUND_FILES = [...IOS_TONE_FILES, ...ZONA_SOUND_FILES] as const;

export type BundledSoundFile = (typeof BUNDLED_SOUND_FILES)[number];

export function isBundledSoundFile(value: string): value is BundledSoundFile {
  return (BUNDLED_SOUND_FILES as readonly string[]).includes(value);
}

export function isIosToneFile(value: string): value is IosToneFile {
  return (IOS_TONE_FILES as readonly string[]).includes(value);
}

/**
 * Concrete `sound` value for the Expo push payload. APNs accepts only
 * `default` or an audio file bundled in the app, so every tone choice travels
 * as its bundled basename and `silent` suppresses the sound.
 */
export function pushPayloadSound(soundName: NotificationSound): string | null {
  if (soundName === 'silent') return null;
  if (soundName === 'default') return 'default';
  return soundName;
}

/**
 * Sound passed to `setNotificationChannelAsync` for a stored choice. The
 * pinned expo-notifications resolves channel sounds to bundled raw resources
 * (`default` maps to the system default notification sound); `silent` maps to
 * `null` (no sound).
 */
export function androidChannelSound(soundName: NotificationSound): string | null {
  if (soundName === 'silent') return null;
  if (soundName === 'default') return 'default';
  return soundName;
}

/**
 * `sound` value for the local preview notification content: `true` plays the
 * system default sound, `false` plays none, and bundled filenames play the
 * file itself (which also verifies the file made it into the build).
 */
export function previewContentSound(soundName: NotificationSound): string | boolean {
  if (soundName === 'silent') return false;
  if (soundName === 'default') return true;
  return soundName;
}

/** Android channel id for a sound choice (must match server push channelId). */
export function soundChannelId(soundName: NotificationSound | string | null): string {
  if (!soundName || soundName === 'silent') return 'zona_silent';
  if (soundName === 'default') return 'zona_default';
  // zona-soft.wav → zona_soft; ios-aurora.wav → zona_ios_aurora
  const slug = soundName.replace(/\.wav$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return slug.startsWith('zona_') ? slug : `zona_${slug}`;
}

/** Picker rows in display order: default, iPhone tones, Zona presets, silent last. */
export const SOUND_CHOICES: readonly NotificationSound[] = [
  'default',
  ...IOS_TONE_FILES,
  ...ZONA_SOUND_FILES,
  'silent',
];

export const soundLabelKeys: Record<NotificationSound, TranslationKey> = {
  default: 'sources.soundDefault',
  silent: 'sources.soundSilent',
  'ios-note.wav': 'sources.soundIosNote',
  'ios-aurora.wav': 'sources.soundIosAurora',
  'ios-bamboo.wav': 'sources.soundIosBamboo',
  'ios-chord.wav': 'sources.soundIosChord',
  'ios-circles.wav': 'sources.soundIosCircles',
  'ios-complete.wav': 'sources.soundIosComplete',
  'ios-hello.wav': 'sources.soundIosHello',
  'ios-input.wav': 'sources.soundIosInput',
  'ios-keys.wav': 'sources.soundIosKeys',
  'ios-popcorn.wav': 'sources.soundIosPopcorn',
  'ios-pulse.wav': 'sources.soundIosPulse',
  'ios-synth.wav': 'sources.soundIosSynth',
  'ios-bell-tower.wav': 'sources.soundIosBellTower',
  'ios-boing.wav': 'sources.soundIosBoing',
  'ios-glass.wav': 'sources.soundIosGlass',
  'ios-harp.wav': 'sources.soundIosHarp',
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
  'ios-note.wav': 'sources.soundIosToneDesc',
  'ios-aurora.wav': 'sources.soundIosToneDesc',
  'ios-bamboo.wav': 'sources.soundIosToneDesc',
  'ios-chord.wav': 'sources.soundIosToneDesc',
  'ios-circles.wav': 'sources.soundIosToneDesc',
  'ios-complete.wav': 'sources.soundIosToneDesc',
  'ios-hello.wav': 'sources.soundIosToneDesc',
  'ios-input.wav': 'sources.soundIosToneDesc',
  'ios-keys.wav': 'sources.soundIosToneDesc',
  'ios-popcorn.wav': 'sources.soundIosToneDesc',
  'ios-pulse.wav': 'sources.soundIosToneDesc',
  'ios-synth.wav': 'sources.soundIosToneDesc',
  'ios-bell-tower.wav': 'sources.soundIosToneDesc',
  'ios-boing.wav': 'sources.soundIosToneDesc',
  'ios-glass.wav': 'sources.soundIosToneDesc',
  'ios-harp.wav': 'sources.soundIosToneDesc',
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
