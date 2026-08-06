import { describe, expect, it, vi } from 'vitest';

import { colors } from '../theme';
import { severityAppearance, severityAppearancesFor } from '../lib/notification-severity';
import { findThemePreset } from '../theme-presets';
import { setActiveThemePreset } from '../theme-preference';

// Storage boundary mock (same in-memory pattern as offline-cache.test.ts) —
// theme-preference imports AsyncStorage at module load.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

describe('notification severity appearance', () => {
  it('keeps notifications without severity on the active theme surface', () => {
    expect(severityAppearance(null)).toEqual({
      background: colors.surface,
      border: colors.border,
      icon: colors.primary,
    });
  });

  it('re-reads the live-bound colors for neutral cards after a theme switch', () => {
    const violet = findThemePreset('violet');
    Object.assign(colors, violet!.colors);
    try {
      expect(severityAppearance(null)).toEqual({
        background: violet!.colors.surface,
        border: violet!.colors.border,
        icon: violet!.colors.primary,
      });
    } finally {
      Object.assign(colors, findThemePreset('meadow')!.colors);
    }
  });

  it('uses progressively warmer candy colors on light presets', () => {
    const light = severityAppearancesFor('light');
    expect(light.low.icon).toBe('#35B968');
    expect(light.medium.icon).toBe('#D5A514');
    expect(light.high.icon).toBe('#ED8129');
    expect(light.critical.icon).toBe('#E9435D');
  });

  it('switches to deep tints on dark presets so light theme text stays readable', async () => {
    const dark = severityAppearancesFor('dark');
    // Dark severity cards must stay dark: every background is closer to the
    // neon surface than to the pastel set, keeping light text on dark cards.
    for (const appearance of Object.values(dark)) {
      expect(appearance.background).toMatch(/^#[0-3]/);
    }
    expect(dark.low.icon).toBe('#2BD97C');
    expect(dark.critical.icon).toBe('#FF6B84');

    await setActiveThemePreset('neon');
    try {
      expect(severityAppearance('critical')).toEqual(dark.critical);
    } finally {
      await setActiveThemePreset('meadow');
    }
    expect(severityAppearance('critical')).toEqual(severityAppearancesFor('light').critical);
  });
});
