import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheStorageKey,
  clearUserCache,
  currentCacheLease,
  getUserCacheSize,
  invalidateCacheLease,
  markCacheDirty,
  readCache,
  writeCache,
} from '../cache/store';

const storage = vi.hoisted(() => new Map<string, string>());

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

describe('offline cache', () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it('returns fresh data, then treats dirty data as stale', async () => {
    await writeCache('user-a', 'inbox', 'all', { ids: ['one'] });
    expect(await readCache('user-a', 'inbox', 'all')).toMatchObject({
      state: 'fresh',
      value: { ids: ['one'] },
    });

    await markCacheDirty('user-a', 'inbox');
    expect((await readCache('user-a', 'inbox', 'all')).state).toBe('stale');
  });

  it('never returns another account’s entry', async () => {
    await writeCache('user-a', 'sources', 'active', [{ id: 'private-a' }]);
    expect((await readCache('user-b', 'sources', 'active')).state).toBe('miss');
    expect(storage.has(cacheStorageKey('user-a', 'sources', 'active'))).toBe(true);
  });

  it('removes corrupt entries instead of exposing them', async () => {
    const key = cacheStorageKey('user-a', 'runtime');
    storage.set(key, '{broken');
    expect((await readCache('user-a', 'runtime')).state).toBe('miss');
    await Promise.resolve();
    expect(storage.has(key)).toBe(false);
  });

  it('rejects oversized entries and stale post-sign-out writes', async () => {
    const tooLarge = 'x'.repeat(20 * 1024);
    expect(await writeCache('user-a', 'preferences', 'default', tooLarge)).toBe(false);

    const lease = currentCacheLease('user-a');
    invalidateCacheLease('user-a');
    expect(await writeCache('user-a', 'inbox', 'all', ['late'], { lease })).toBe(false);
  });

  it('reports usage and clears only the selected account', async () => {
    await writeCache('user-a', 'changelog', 'ios', ['a']);
    await writeCache('user-b', 'changelog', 'ios', ['b']);
    expect(await getUserCacheSize('user-a')).toBeGreaterThan(0);

    await clearUserCache('user-a');
    expect((await readCache('user-a', 'changelog', 'ios')).state).toBe('miss');
    expect((await readCache('user-b', 'changelog', 'ios')).value).toEqual(['b']);
  });
});
