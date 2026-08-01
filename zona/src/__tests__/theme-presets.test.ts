import { describe, expect, it } from 'vitest';

import { colors } from '../theme';
import { defaultThemePreset, themeColorKeys, themePresets } from '../theme-presets';

const hexColor = /^#[0-9A-Fa-f]{6}$/;

describe('theme presets', () => {
  it('offers the shipped palette as the default plus three new presets', () => {
    expect(themePresets).toHaveLength(4);
    expect(defaultThemePreset.id).toBe('meadow');
    expect(themePresets.map((preset) => preset.id)).toEqual(['meadow', 'ocean', 'sunset', 'violet']);
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
});
