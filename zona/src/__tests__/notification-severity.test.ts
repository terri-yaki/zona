import { describe, expect, it } from 'vitest';

import { colors } from '../theme';
import { severityAppearance } from '../lib/notification-severity';
import { findThemePreset } from '../theme-presets';

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

  it('uses progressively warmer candy colors', () => {
    expect(severityAppearance('low').icon).toBe('#35B968');
    expect(severityAppearance('medium').icon).toBe('#D5A514');
    expect(severityAppearance('high').icon).toBe('#ED8129');
    expect(severityAppearance('critical').icon).toBe('#E9435D');
  });
});
