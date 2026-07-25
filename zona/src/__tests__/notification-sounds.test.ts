import { describe, expect, it } from 'vitest';

import appJson from '../../app.json';
import { en } from '../i18n/en';
import { zhHant } from '../i18n/zh-Hant';
import {
  androidChannelSound,
  BUNDLED_SOUND_FILES,
  isBundledSoundFile,
  isNativeSoundId,
  NATIVE_SOUND_IDS,
  previewContentSound,
  pushPayloadSound,
  SOUND_CHOICES,
  soundChannelId,
  soundDescriptionKeys,
  soundLabelKeys,
} from '../lib/notification-sound-map';
import type { NotificationSound } from '../types/database';

describe('notification sound picker list', () => {
  it('offers the phone-native notification, alarm, and ringtone options', () => {
    expect(SOUND_CHOICES).toContain('native-notification');
    expect(SOUND_CHOICES).toContain('native-alarm');
    expect(SOUND_CHOICES).toContain('native-ringtone');
  });

  it('lists special, native, then bundled sounds with silent last and no duplicates', () => {
    expect(SOUND_CHOICES).toEqual(['default', ...NATIVE_SOUND_IDS, ...BUNDLED_SOUND_FILES, 'silent']);
    expect(new Set(SOUND_CHOICES).size).toBe(SOUND_CHOICES.length);
  });

  it('has resolvable label and description strings in every catalog for every choice', () => {
    for (const choice of SOUND_CHOICES) {
      for (const catalog of [en, zhHant]) {
        const label = catalog[soundLabelKeys[choice]];
        const description = catalog[soundDescriptionKeys[choice]];
        expect(typeof label, `${choice} label`).toBe('string');
        expect(label.length, `${choice} label`).toBeGreaterThan(0);
        expect(typeof description, `${choice} description`).toBe('string');
        expect(description.length, `${choice} description`).toBeGreaterThan(0);
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
    for (const file of BUNDLED_SOUND_FILES) {
      expect(pluginSounds, file).toContain(`./assets/sounds/${file}`);
    }
  });
});

describe('notification sound mapping', () => {
  it('identifies the native choices and nothing else', () => {
    expect(NATIVE_SOUND_IDS).toEqual(['native-notification', 'native-alarm', 'native-ringtone']);
    for (const choice of SOUND_CHOICES) {
      const expected = choice.startsWith('native-');
      expect(isNativeSoundId(choice), choice).toBe(expected);
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

  it('maps every native choice to the phone system sound on each platform', () => {
    // APNs only accepts `default` or bundled files, and the pinned Android
    // client resolves channel sounds to bundled resources or the system
    // default notification sound — so native choices resolve to the system
    // default sound (exact for native-notification, documented degradation
    // for native-alarm / native-ringtone) with a per-choice Android channel.
    const expected: Record<(typeof NATIVE_SOUND_IDS)[number], string> = {
      'native-notification': 'zona_native_notification',
      'native-alarm': 'zona_native_alarm',
      'native-ringtone': 'zona_native_ringtone',
    };
    for (const nativeId of NATIVE_SOUND_IDS) {
      expect(pushPayloadSound(nativeId), nativeId).toBe('default');
      expect(androidChannelSound(nativeId), nativeId).toBe('default');
      expect(previewContentSound(nativeId), nativeId).toBe(true);
      expect(soundChannelId(nativeId), nativeId).toBe(expected[nativeId]);
    }
  });

  it('maps every bundled preset to its file and slugged channel', () => {
    for (const file of BUNDLED_SOUND_FILES) {
      expect(pushPayloadSound(file)).toBe(file);
      expect(androidChannelSound(file)).toBe(file);
      expect(previewContentSound(file)).toBe(file);
      expect(soundChannelId(file)).toBe(file.replace(/\.wav$/i, '').replace(/-/g, '_'));
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
      } else if (isNativeSoundId(choice) || choice === 'default') {
        expect(payload).toBe('default');
        expect(channelSound).toBe('default');
        expect(preview).toBe(true);
      } else {
        expect(payload).toBe(choice);
        expect(channelSound).toBe(choice);
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
