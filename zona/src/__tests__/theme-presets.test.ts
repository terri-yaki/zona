import { describe, expect, it } from 'vitest';

import { colors } from '../theme';
import { defaultThemePreset, findThemePreset, themeColorKeys, themePresets } from '../theme-presets';

const hexColor = /^#[0-9A-Fa-f]{6}$/;

describe('theme presets', () => {
  it('offers seven named themes with Meadow as the default', () => {
    expect(themePresets).toHaveLength(7);
    expect(defaultThemePreset.id).toBe('meadow');
    expect(themePresets.map((preset) => preset.id)).toEqual([
      'meadow',
      'ocean',
      'sunset',
      'violet',
      'minimalist',
      'marshmallow',
      'neon',
    ]);
  });

  it('every preset declares a valid appearance for status-bar chrome', () => {
    for (const preset of themePresets) {
      expect(['light', 'dark'], `preset ${preset.id} appearance`).toContain(preset.appearance);
    }
    expect(findThemePreset('neon')?.appearance).toBe('dark');
    expect(findThemePreset('minimalist')?.appearance).toBe('light');
  });

  it('every preset defines the complete consumed color key set with valid values', () => {
    const consumedKeys = Object.keys(colors).sort();
    expect([...themeColorKeys].sort()).toEqual(consumedKeys);
    for (const preset of themePresets) {
      expect(Object.keys(preset.colors).sort(), `preset ${preset.id} keys`).toEqual(consumedKeys);
      for (const [key, value] of Object.entries(preset.colors)) {
        expect(value, `preset ${preset.id} color ${key}`).toMatch(hexColor);
      }
    }
  });

  it('the default preset mirrors the shipped palette exactly', () => {
    expect(defaultThemePreset.colors).toEqual({ ...colors });
  });

  it('new presets are visually distinct from the default in their primary families', () => {
    for (const preset of themePresets.slice(1)) {
      expect(preset.colors.primary).not.toBe(defaultThemePreset.colors.primary);
      expect(preset.colors.background).not.toBe(defaultThemePreset.colors.background);
    }
  });

  it('live activity overrides, when present, are complete hex palettes', () => {
    for (const preset of themePresets) {
      if (!preset.liveActivity) continue;
      expect(Object.keys(preset.liveActivity).sort(), `preset ${preset.id} live activity keys`)
        .toEqual(['background', 'subtitle', 'title']);
      for (const value of Object.values(preset.liveActivity)) {
        expect(value, `preset ${preset.id} live activity color`).toMatch(hexColor);
      }
    }
    // Neon ships an explicit dark lock-screen card; marshmallow and the other
    // presets derive their palette from the primary family instead.
    expect(themePresets.filter((preset) => preset.liveActivity).map((preset) => preset.id)).toEqual(['neon']);
  });
});
