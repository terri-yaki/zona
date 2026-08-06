import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppOptions, sanitizeAppOptions } from '../data/options';
import { FOREGROUND_REFRESH_TIMEOUT_MS } from '../lib/timeout';

const rpc = vi.hoisted(() => vi.fn());
const storage = vi.hoisted(() => new Map<string, string>());

// Storage boundary mock (same in-memory pattern as offline-cache.test.ts).
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => [...storage.keys()]),
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storage.get(key) ?? null])),
    multiRemove: vi.fn(async (keys: string[]) => keys.forEach((key) => storage.delete(key))),
    multiSet: vi.fn(async (entries: [string, string][]) => entries.forEach(([key, value]) => storage.set(key, value))),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

describe('sanitizeAppOptions', () => {
  it('seeds enabled-by-default flags from an empty payload', () => {
    // This is the fallback the settings screen uses when the preferences RPC
    // fails: the toggles must come up enabled, not greyed out.
    expect(sanitizeAppOptions({})).toEqual({
      created_at: new Date(0).toISOString(),
      is_premium: false,
      live_activity_enabled: false,
      play_sound: true,
      premium_customer_id: null,
      premium_expires_at: null,
      premium_plan: null,
      premium_product_id: null,
      premium_status: null,
      premium_store: null,
      push_enabled: true,
      show_preview: true,
      updated_at: new Date(0).toISOString(),
      user_id: '',
    });
  });

  it('preserves explicit values and rejects malformed fields', () => {
    expect(sanitizeAppOptions({
      is_premium: true,
      live_activity_enabled: true,
      play_sound: false,
      premium_plan: 'annual',
      push_enabled: false,
      show_preview: false,
      user_id: 'user-a',
    })).toMatchObject({
      is_premium: true,
      live_activity_enabled: true,
      play_sound: false,
      premium_plan: 'annual',
      push_enabled: false,
      show_preview: false,
      user_id: 'user-a',
    });

    expect(sanitizeAppOptions({ push_enabled: 'yes', premium_plan: 42 })).toMatchObject({
      premium_plan: null,
      push_enabled: true,
    });
  });

  it('treats non-object payloads as empty', () => {
    for (const value of [null, undefined, 'broken', 7, [true]]) {
      expect(sanitizeAppOptions(value).push_enabled).toBe(true);
    }
  });
});

describe('getAppOptions', () => {
  beforeEach(() => {
    rpc.mockReset();
    storage.clear();
  });

  it('returns the sanitized RPC payload', async () => {
    rpc.mockResolvedValue({
      data: { play_sound: false, push_enabled: true, user_id: 'user-fetch' },
      error: null,
    });

    await expect(getAppOptions('user-fetch', true)).resolves.toMatchObject({
      play_sound: false,
      push_enabled: true,
      show_preview: true,
      user_id: 'user-fetch',
    });
    expect(rpc).toHaveBeenCalledWith('get_user_notification_preferences');
  });

  it('rejects RPC failures so settings can seed safe defaults', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network unavailable' } });

    await expect(getAppOptions('user-error', true)).rejects.toBeTruthy();
  });

  it('bounds a hung RPC with withTimeout instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      // A connection that never settles must still reject, otherwise a fresh
      // account's settings toggles stay greyed out indefinitely.
      rpc.mockReturnValue(new Promise(() => undefined));
      const pending = getAppOptions('user-hung', true);
      const assertion = expect(pending).rejects.toThrow('Notification options could not be loaded.');
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS + 1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
