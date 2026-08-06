import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';

import { colors } from '../theme';
import { setActiveThemePreset, useThemedStyles } from '../theme-preference';
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

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Mirrors the shipped screen pattern: a StyleSheet factory whose color reads
// must re-resolve when the active preset changes.
const createStyles = () => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border },
  title: { color: colors.primary },
});

let captured: ReturnType<typeof createStyles> | null = null;
function Probe() {
  const styles = useThemedStyles(createStyles);
  useEffect(() => {
    captured = styles;
  });
  return null;
}

describe('themed styles', () => {
  beforeEach(() => {
    storage.clear();
    captured = null;
  });

  it('re-reads colors on preset change instead of keeping module-load values', async () => {
    const meadow = findThemePreset('meadow');
    const violet = findThemePreset('violet');
    await setActiveThemePreset('meadow');

    await act(async () => {
      create(<Probe />);
    });

    expect(captured!.title.color).toBe(meadow!.colors.primary);
    expect(captured!.card.borderColor).toBe(meadow!.colors.border);

    await act(async () => {
      await setActiveThemePreset('violet');
    });

    // The same StyleSheet body now resolves to the newly active preset.
    expect(captured!.title.color).toBe(violet!.colors.primary);
    expect(captured!.card.borderColor).toBe(violet!.colors.border);
    expect(captured!.title.color).not.toBe(meadow!.colors.primary);

    await act(async () => {
      await setActiveThemePreset('meadow');
    });
  });

  it('reuses the style graph across re-renders until the preset changes', async () => {
    let builds = 0;
    const countingFactory = () => {
      builds += 1;
      return StyleSheet.create({ title: { color: colors.primary } });
    };
    function CountingProbe() {
      useThemedStyles(countingFactory);
      return null;
    }

    await setActiveThemePreset('meadow');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<CountingProbe />);
    });
    const afterMount = builds;

    // Unrelated re-renders must not reallocate the style graph.
    await act(async () => {
      renderer!.update(<CountingProbe />);
    });
    expect(builds).toBe(afterMount);

    // A theme switch re-reads the live-bound colors exactly once per render.
    await act(async () => {
      await setActiveThemePreset('violet');
    });
    expect(builds).toBeGreaterThan(afterMount);

    await act(async () => {
      await setActiveThemePreset('meadow');
    });
  });
});
