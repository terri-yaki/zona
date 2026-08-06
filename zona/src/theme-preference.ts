import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useSyncExternalStore } from 'react';

import { colors } from './theme';
import { defaultThemePreset, findThemePreset, themePresets, type ThemePreset } from './theme-presets';

/**
 * Active theme preset state. Screens keep importing `colors` from `@/theme`;
 * switching a preset mutates that shared object in place (live binding), and
 * subscribers (root layout, Settings) re-render so every screen repaints
 * without per-screen refactors. The choice persists on-device only.
 */
const storageKey = 'zona.theme-preset.v1';

let activePreset: ThemePreset = defaultThemePreset;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getActiveThemePreset(): ThemePreset {
  return activePreset;
}

export function getActiveThemePresetId(): string {
  return activePreset.id;
}

export function subscribeThemePreference(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot for useSyncExternalStore: changes exactly when the preset does. */
export function useThemePreferenceId(): string {
  return useSyncExternalStore(subscribeThemePreference, getActiveThemePresetId);
}

/**
 * Subscribed preset accessor for components that need the full preset
 * (appearance flag, Live Activity palette), not just the id.
 */
export function useActiveThemePreset(): ThemePreset {
  return useSyncExternalStore(subscribeThemePreference, getActiveThemePreset);
}

/**
 * Subscribes the component to preset changes and rebuilds styles exactly when
 * the preset changes, so `StyleSheet.create(...)` bodies re-read the
 * live-bound `colors` after a theme switch instead of keeping the values
 * baked at module load. The factory closes over that live binding, so the
 * preset id is the correct memoization key: unrelated re-renders (e.g.
 * per-row inbox cards) reuse the style graph instead of reallocating it.
 * Use as `const styles = useThemedStyles(createStyles);` in each component.
 */
export function useThemedStyles<T>(factory: () => T): T {
  const presetId = useThemePreferenceId();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the factory reads the live-bound colors; the preset id invalidates it.
  return useMemo(() => factory(), [presetId]);
}

function applyPreset(preset: ThemePreset) {
  activePreset = preset;
  Object.assign(colors, preset.colors);
  emit();
}

export async function setActiveThemePreset(id: string): Promise<ThemePreset> {
  const preset = findThemePreset(id);
  if (!preset) throw new Error('UNKNOWN_THEME_PRESET');
  applyPreset(preset);
  try {
    await AsyncStorage.setItem(storageKey, preset.id);
  } catch (storageError) {
    console.warn('Could not save the theme preference.', storageError);
  }
  return preset;
}

/**
 * Reads the persisted choice and applies it. Returns the active preset id —
 * unknown or missing values fall back to the default preset.
 */
export async function hydrateThemePreference(): Promise<string> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(storageKey);
  } catch (storageError) {
    console.warn('Could not read the theme preference.', storageError);
  }
  const preset = findThemePreset(stored) ?? defaultThemePreset;
  if (preset.id !== activePreset.id) applyPreset(preset);
  return preset.id;
}

export { themePresets };
