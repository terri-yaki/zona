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
 * iPhone ringtones bundled with the app (assets/sounds/ios-*.wav), listed in
 * the same order as the iOS-style picker the feature mirrors. iOS gives apps
 * no API to reference the phone's system tones, so (like Slack et al.) the
 * tones are bundled audio files that APNs plays by basename. Provenance and
 * licensing are documented in CHANGELOG.md.
 */
export const IOS_TONE_FILES = [
  'ios-alarm.wav',
  'ios-apex.wav',
  'ios-ascending.wav',
  'ios-aurora.wav',
  'ios-bamboo.wav',
  'ios-bark.wav',
  'ios-beacon.wav',
  'ios-bell-tower.wav',
  'ios-blues.wav',
  'ios-boing.wav',
  'ios-bulletin.wav',
  'ios-by-the-seaside.wav',
  'ios-chimes.wav',
  'ios-chord.wav',
  'ios-circles.wav',
  'ios-circuit.wav',
  'ios-complete.wav',
  'ios-constellation.wav',
  'ios-cosmic.wav',
  'ios-crickets.wav',
  'ios-crystals.wav',
  'ios-digital.wav',
  'ios-doorbell.wav',
  'ios-duck.wav',
  'ios-glass.wav',
  'ios-harp.wav',
  'ios-hello.wav',
  'ios-hillside.wav',
  'ios-illuminate.wav',
  'ios-input.wav',
  'ios-keys.wav',
  'ios-marimba.wav',
  'ios-motorcycle.wav',
  'ios-night-owl.wav',
  'ios-note.wav',
  'ios-old-car-horn.wav',
  'ios-old-phone.wav',
  'ios-opening.wav',
  'ios-piano-riff.wav',
  'ios-pinball.wav',
  'ios-playtime.wav',
  'ios-popcorn.wav',
  'ios-presto.wav',
  'ios-pulse.wav',
  'ios-radar.wav',
  'ios-radiate.wav',
  'ios-reflection.wav',
  'ios-ripples.wav',
  'ios-robot.wav',
  'ios-sci-fi.wav',
  'ios-sencha.wav',
  'ios-signal.wav',
  'ios-silk.wav',
  'ios-slow-rise.wav',
  'ios-sonar.wav',
  'ios-stargaze.wav',
  'ios-strum.wav',
  'ios-summit.wav',
  'ios-synth.wav',
  'ios-timba.wav',
  'ios-time-passing.wav',
  'ios-trill.wav',
  'ios-twinkle.wav',
  'ios-uplift.wav',
  'ios-waves.wav',
  'ios-xylophone.wav',
] as const;

export type IosToneFile = (typeof IOS_TONE_FILES)[number];

/** Every sound file bundled in the app (the iPhone ringtone collection). */
export const BUNDLED_SOUND_FILES = [...IOS_TONE_FILES] as const;

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
  return 'default';
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
  return 'zona_default';
}

/** Picker rows in display order: default, the iPhone ringtone collection, silent last. */
export const SOUND_CHOICES: readonly NotificationSound[] = [
  'default',
  ...IOS_TONE_FILES,
  'silent',
];

export const soundLabelKeys: Record<NotificationSound, TranslationKey> = {
  default: 'sources.soundDefault',
  silent: 'sources.soundSilent',
  'ios-alarm.wav': 'sources.soundIosAlarm',
  'ios-apex.wav': 'sources.soundIosApex',
  'ios-ascending.wav': 'sources.soundIosAscending',
  'ios-aurora.wav': 'sources.soundIosAurora',
  'ios-bamboo.wav': 'sources.soundIosBamboo',
  'ios-bark.wav': 'sources.soundIosBark',
  'ios-beacon.wav': 'sources.soundIosBeacon',
  'ios-bell-tower.wav': 'sources.soundIosBellTower',
  'ios-blues.wav': 'sources.soundIosBlues',
  'ios-boing.wav': 'sources.soundIosBoing',
  'ios-bulletin.wav': 'sources.soundIosBulletin',
  'ios-by-the-seaside.wav': 'sources.soundIosByTheSeaside',
  'ios-chimes.wav': 'sources.soundIosChimes',
  'ios-chord.wav': 'sources.soundIosChord',
  'ios-circles.wav': 'sources.soundIosCircles',
  'ios-circuit.wav': 'sources.soundIosCircuit',
  'ios-complete.wav': 'sources.soundIosComplete',
  'ios-constellation.wav': 'sources.soundIosConstellation',
  'ios-cosmic.wav': 'sources.soundIosCosmic',
  'ios-crickets.wav': 'sources.soundIosCrickets',
  'ios-crystals.wav': 'sources.soundIosCrystals',
  'ios-digital.wav': 'sources.soundIosDigital',
  'ios-doorbell.wav': 'sources.soundIosDoorbell',
  'ios-duck.wav': 'sources.soundIosDuck',
  'ios-glass.wav': 'sources.soundIosGlass',
  'ios-harp.wav': 'sources.soundIosHarp',
  'ios-hello.wav': 'sources.soundIosHello',
  'ios-hillside.wav': 'sources.soundIosHillside',
  'ios-illuminate.wav': 'sources.soundIosIlluminate',
  'ios-input.wav': 'sources.soundIosInput',
  'ios-keys.wav': 'sources.soundIosKeys',
  'ios-marimba.wav': 'sources.soundIosMarimba',
  'ios-motorcycle.wav': 'sources.soundIosMotorcycle',
  'ios-night-owl.wav': 'sources.soundIosNightOwl',
  'ios-note.wav': 'sources.soundIosNote',
  'ios-old-car-horn.wav': 'sources.soundIosOldCarHorn',
  'ios-old-phone.wav': 'sources.soundIosOldPhone',
  'ios-opening.wav': 'sources.soundIosOpening',
  'ios-piano-riff.wav': 'sources.soundIosPianoRiff',
  'ios-pinball.wav': 'sources.soundIosPinball',
  'ios-playtime.wav': 'sources.soundIosPlaytime',
  'ios-popcorn.wav': 'sources.soundIosPopcorn',
  'ios-presto.wav': 'sources.soundIosPresto',
  'ios-pulse.wav': 'sources.soundIosPulse',
  'ios-radar.wav': 'sources.soundIosRadar',
  'ios-radiate.wav': 'sources.soundIosRadiate',
  'ios-reflection.wav': 'sources.soundIosReflection',
  'ios-ripples.wav': 'sources.soundIosRipples',
  'ios-robot.wav': 'sources.soundIosRobot',
  'ios-sci-fi.wav': 'sources.soundIosSciFi',
  'ios-sencha.wav': 'sources.soundIosSencha',
  'ios-signal.wav': 'sources.soundIosSignal',
  'ios-silk.wav': 'sources.soundIosSilk',
  'ios-slow-rise.wav': 'sources.soundIosSlowRise',
  'ios-sonar.wav': 'sources.soundIosSonar',
  'ios-stargaze.wav': 'sources.soundIosStargaze',
  'ios-strum.wav': 'sources.soundIosStrum',
  'ios-summit.wav': 'sources.soundIosSummit',
  'ios-synth.wav': 'sources.soundIosSynth',
  'ios-timba.wav': 'sources.soundIosTimba',
  'ios-time-passing.wav': 'sources.soundIosTimePassing',
  'ios-trill.wav': 'sources.soundIosTrill',
  'ios-twinkle.wav': 'sources.soundIosTwinkle',
  'ios-uplift.wav': 'sources.soundIosUplift',
  'ios-waves.wav': 'sources.soundIosWaves',
  'ios-xylophone.wav': 'sources.soundIosXylophone',
};

/**
 * Display label for any stored `sound_name`, including legacy values the app
 * no longer offers (e.g. removed presets whose migration has not run yet):
 * unknown values fall back to a generic "custom sound" label instead of
 * crashing the sources screen.
 */
export function soundLabelKeyFor(soundName: NotificationSound | string | null | undefined): TranslationKey {
  if (soundName && Object.prototype.hasOwnProperty.call(soundLabelKeys, soundName)) {
    return soundLabelKeys[soundName as NotificationSound];
  }
  return 'sources.soundUnknown';
}

/**
 * Descriptions are shown only for the special choices. iPhone tone rows show
 * just the tone name (they are Apple's tones, not Zona-built-in sounds, so
 * there is nothing to caption).
 */
export const soundDescriptionKeys: Record<Exclude<NotificationSound, IosToneFile>, TranslationKey> = {
  default: 'sources.soundDefaultDesc',
  silent: 'sources.soundSilentDesc',
};
