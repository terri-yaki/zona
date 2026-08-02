import { beforeEach, describe, expect, it, vi } from 'vitest';

import { colors } from '../theme';
import {
  getActiveThemePresetId,
  hydrateThemePreference,
  setActiveThemePreset,
  subscribeThemePreference,
} from '../theme-preference';
import { findThemePreset } from '../theme-presets';

// Storage boundary mock (same in-memory pattern as offline-cache.test.ts).
const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

describe('theme preference', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('selecting a preset live-binds the shared colors object screens consume', async () => {
    const ocean = findThemePreset('ocean');
    expect(ocean).not.toBeNull();

    await setActiveThemePreset('ocean');

    expect(getActiveThemePresetId()).toBe('ocean');
    expect(colors.primary).toBe(ocean!.colors.primary);
    expect(colors.background).toBe(ocean!.colors.background);
  });

  it('notifies subscribers when the preset changes', async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeThemePreference(() => seen.push(getActiveThemePresetId()));

    await setActiveThemePreset('violet');
    unsubscribe();
    await setActiveThemePreset('ocean');

    expect(seen).toEqual(['violet']);
  });

  it('rejects unknown presets without changing the active theme', async () => {
    await setActiveThemePreset('meadow');
    await expect(setActiveThemePreset('ultraviolet')).rejects.toThrowError('UNKNOWN_THEME_PRESET');
    expect(getActiveThemePresetId()).toBe('meadow');
  });

  it('selects the newly added minimalist and neon presets', async () => {
    await setActiveThemePreset('minimalist');
    expect(getActiveThemePresetId()).toBe('minimalist');
    expect(colors.primary).toBe(findThemePreset('minimalist')!.colors.primary);

    await setActiveThemePreset('neon');
    expect(getActiveThemePresetId()).toBe('neon');
    expect(colors.background).toBe(findThemePreset('neon')!.colors.background);
  });

  it('persists the choice across a simulated restart', async () => {
    const sunset = findThemePreset('sunset');
    await setActiveThemePreset('sunset');

    // Simulate a cold start: wipe module state, re-import, hydrate from storage.
    vi.resetModules();
    const freshPreference = await import('../theme-preference');
    const freshTheme = await import('../theme');

    await expect(freshPreference.hydrateThemePreference()).resolves.toBe('sunset');
    expect(freshTheme.colors.primary).toBe(sunset!.colors.primary);
  });

  it('falls back to the default preset when storage is empty or holds an unknown id', async () => {
    await expect(hydrateThemePreference()).resolves.toBe('meadow');
    storage.set('zona.theme-preset.v1', 'deleted-preset');
    await expect(hydrateThemePreference()).resolves.toBe('meadow');
  });
});
