import { describe, expect, it } from 'vitest';

import appJson from '../../app.json';
import { en } from '../i18n/en';
import { zhHant } from '../i18n/zh-Hant';
import {
  androidChannelSound,
  BUNDLED_SOUND_FILES,
  IOS_TONE_FILES,
  isBundledSoundFile,
  isIosToneFile,
  previewContentSound,
  pushPayloadSound,
  SOUND_CHOICES,
  soundChannelId,
  soundDescriptionKeys,
  soundLabelKeyFor,
  soundLabelKeys,
} from '../lib/notification-sound-map';
import type { NotificationSound } from '../types/database';

describe('notification sound picker list', () => {
  it('offers the full bundled iPhone ringtone collection', () => {
    expect(IOS_TONE_FILES).toHaveLength(66);
    for (const tone of IOS_TONE_FILES) {
      expect(SOUND_CHOICES, tone).toContain(tone);
    }
    // Spot-check the tones from the reference picker screenshot.
    for (const tone of ['ios-note.wav', 'ios-aurora.wav', 'ios-bamboo.wav', 'ios-chord.wav', 'ios-boing.wav', 'ios-glass.wav', 'ios-harp.wav']) {
      expect(SOUND_CHOICES, tone).toContain(tone);
    }
  });

  it('offers only default, the 66 iPhone tones, and silent (68 rows), with no duplicates', () => {
    expect(SOUND_CHOICES).toEqual(['default', ...IOS_TONE_FILES, 'silent']);
    expect(SOUND_CHOICES).toHaveLength(68);
    expect(SOUND_CHOICES.some((choice) => choice.startsWith('zona-'))).toBe(false);
    expect(new Set(SOUND_CHOICES).size).toBe(SOUND_CHOICES.length);
  });

  it('labels any stored sound safely, including legacy values no longer offered', () => {
    expect(soundLabelKeyFor('default')).toBe('sources.soundDefault');
    expect(soundLabelKeyFor('ios-aurora.wav')).toBe('sources.soundIosAurora');
    expect(soundLabelKeyFor('silent')).toBe('sources.soundSilent');

    // Legacy presets removed from the app must still render a sane label.
    const fallbackKey = soundLabelKeyFor('zona-soft.wav');
    expect(fallbackKey).toBe('sources.soundUnknown');
    expect(soundLabelKeyFor('zona-pulse.wav')).toBe(fallbackKey);
    expect(soundLabelKeyFor('ios-not-a-tone.wav')).toBe(fallbackKey);
    expect(soundLabelKeyFor(null)).toBe(fallbackKey);
    expect(soundLabelKeyFor(undefined)).toBe(fallbackKey);
    expect(soundLabelKeyFor('')).toBe(fallbackKey);

    for (const catalog of [en, zhHant]) {
      expect(typeof catalog[fallbackKey], 'fallback label resolves').toBe('string');
      expect(catalog[fallbackKey].length).toBeGreaterThan(0);
    }
  });

  it('shows a resolvable label for every choice, and captions only non-iPhone rows', () => {
    for (const choice of SOUND_CHOICES) {
      for (const catalog of [en, zhHant]) {
        const label = catalog[soundLabelKeys[choice]];
        expect(typeof label, `${choice} label`).toBe('string');
        expect(label.length, `${choice} label`).toBeGreaterThan(0);
      }
      if (isIosToneFile(choice)) {
        // iPhone tones are Apple's own sounds — the row shows just the name.
        expect(soundDescriptionKeys, `${choice} has no caption`).not.toHaveProperty(choice);
      } else {
        const descriptionKey = soundDescriptionKeys[choice];
        for (const catalog of [en, zhHant]) {
          const description = catalog[descriptionKey];
          expect(typeof description, `${choice} description`).toBe('string');
          expect(description.length, `${choice} description`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the bundled list in sync with the app.json expo-notifications plugin', () => {
    type NotificationsPluginEntry = [string, { sounds?: string[] }?];
    const plugins = (appJson as { expo: { plugins?: unknown[] } }).expo.plugins ?? [];
    const plugin = plugins.find(
      (candidate): candidate is NotificationsPluginEntry => Array.isArray(candidate) && candidate[0] === 'expo-notifications',
    );
    expect(plugin, 'expo-notifications plugin with sounds list').toBeDefined();
    const pluginSounds = plugin?.[1]?.sounds ?? [];
    expect(BUNDLED_SOUND_FILES).toHaveLength(66);
    for (const file of BUNDLED_SOUND_FILES) {
      expect(pluginSounds, file).toContain(`./assets/sounds/${file}`);
    }
    expect(pluginSounds.some((sound) => sound.includes('zona-'))).toBe(false);
  });
});

describe('notification sound mapping', () => {
  it('classifies iPhone tones, Zona presets, and special choices', () => {
    for (const choice of SOUND_CHOICES) {
      expect(isIosToneFile(choice), choice).toBe(choice.startsWith('ios-'));
      expect(isBundledSoundFile(choice), choice).toBe(choice.endsWith('.wav'));
    }
  });

  it('maps the special choices for payload, channel, and preview', () => {
    expect(pushPayloadSound('default')).toBe('default');
    expect(androidChannelSound('default')).toBe('default');
    expect(previewContentSound('default')).toBe(true);
    expect(soundChannelId('default')).toBe('zona_default');

    expect(pushPayloadSound('silent')).toBeNull();
    expect(androidChannelSound('silent')).toBeNull();
    expect(previewContentSound('silent')).toBe(false);
    expect(soundChannelId('silent')).toBe('zona_silent');
  });

  it('keeps iPhone tone files for APNs and falls back to Android default sound', () => {
    for (const tone of IOS_TONE_FILES) {
      expect(pushPayloadSound(tone), tone).toBe(tone);
      expect(androidChannelSound(tone), tone).toBe('default');
      expect(previewContentSound(tone), tone).toBe(tone);
      expect(soundChannelId(tone), tone).toBe('zona_default');
    }
  });

  it('maps every picker choice to a consistent, defined set of concrete values', () => {
    for (const choice of SOUND_CHOICES) {
      const payload = pushPayloadSound(choice);
      const channelSound = androidChannelSound(choice);
      const preview = previewContentSound(choice);
      const channelId = soundChannelId(choice);

      expect(channelId, choice).toMatch(/^zona_[a-z0-9_]+$/);
      if (choice === 'silent') {
        expect(payload).toBeNull();
        expect(channelSound).toBeNull();
        expect(preview).toBe(false);
      } else if (choice === 'default') {
        expect(payload).toBe('default');
        expect(channelSound).toBe('default');
        expect(preview).toBe(true);
      } else {
        expect(payload).toBe(choice);
        expect(channelSound).toBe('default');
        expect(preview).toBe(choice);
      }
    }
  });

  it('keeps push-payload values aligned with the preview for every choice', () => {
    for (const choice of SOUND_CHOICES) {
      const payload = pushPayloadSound(choice as NotificationSound);
      const preview = previewContentSound(choice as NotificationSound);
      if (payload === null) {
        expect(preview, choice).toBe(false);
      } else if (payload === 'default') {
        expect(preview, choice).toBe(true);
      } else {
        expect(preview, choice).toBe(payload);
      }
    }
  });
});
