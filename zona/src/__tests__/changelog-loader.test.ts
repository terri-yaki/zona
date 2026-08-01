import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeCache } from '../cache/store';
import { loadChangelogRows } from '../data/changelog';
import { parseChangelogRows } from '../lib/changelog';

// Storage boundary mock (same in-memory pattern as offline-cache.test.ts).
const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => [...storage.keys()]),
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storage.get(key) ?? null] as [string, string | null])),
    multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); }),
    multiSet: vi.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => storage.set(key, value)); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

// Transport boundary mock: the supabase-js query chain
// from().select().eq().order() resolves to the queued server result.
const server = vi.hoisted(() => ({
  fromCalls: [] as string[],
  result: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      server.fromCalls.push(table);
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: server.result.data, error: server.result.error }),
          }),
        }),
      };
    },
  },
}));

// Parsed-row cache seed: v0.0.6 only, as written by an earlier successful fetch.
const cachedV006 = {
  id: 'rel-006',
  version: '0.0.6',
  released_at: '2026-07-28T00:00:00+00:00',
  title_en: 'Cached v0.0.6 title',
  title_zh_hant: '',
  summary_en: 'cached summary',
  summary_zh_hant: '',
  items: [],
};

// Raw `app_release_notes` response: the operator just flipped v0.0.7 to active.
const serverV007 = {
  id: 'rel-007',
  version: '0.0.7',
  released_at: '2026-07-29T00:00:00+00:00',
  title_en: 'Server v0.0.7 title',
  title_zh_hant: '伺服器版本',
  summary_en: 'server summary',
  summary_zh_hant: '',
  app_release_note_items: [
    {
      id: 'item-1',
      item_key: 'offline-inbox',
      icon_name: 'sparkles',
      title_en: 'New server feature',
      title_zh_hant: '',
      body_en: 'body',
      body_zh_hant: '',
      position: 0,
      is_active: true,
      platform: null,
    },
  ],
};
const serverV006 = { ...cachedV006, app_release_note_items: [] };

async function seedFreshCache(userId: string) {
  await writeCache(userId, 'changelog', 'ios', parseChangelogRows([cachedV006]));
}

describe('changelog loader (network-first)', () => {
  beforeEach(() => {
    storage.clear();
    server.fromCalls.length = 0;
    server.result = { data: null, error: null };
  });

  it('always fetches and lets server rows win over a fresh cache (DB is_active flip must appear)', async () => {
    const userId = 'user-regression';
    await seedFreshCache(userId);
    server.result = { data: [serverV007, serverV006], error: null };

    const painted: string[][] = [];
    const rows = await loadChangelogRows(userId, (cached) => painted.push(cached.map((row) => row.id)));

    // The fetch must run even though the cache entry is within its fresh window.
    expect(server.fromCalls).toEqual(['app_release_notes']);
    // Instant paint still comes from the cache while the fetch is in flight.
    expect(painted).toEqual([['rel-006']]);
    // Final content is the fresh server state: the just-activated v0.0.7 shows up.
    expect(rows?.map((row) => row.id)).toEqual(['rel-007', 'rel-006']);
    expect(rows?.[0].title.en).toBe('Server v0.0.7 title');
  });

  it('falls back to cached rows when the fetch fails', async () => {
    const userId = 'user-offline-cache';
    await seedFreshCache(userId);
    server.result = { data: null, error: { message: 'network down' } };

    const rows = await loadChangelogRows(userId);

    expect(rows?.map((row) => row.id)).toEqual(['rel-006']);
  });

  it('returns null when the fetch fails and nothing is cached (bundled path)', async () => {
    server.result = { data: null, error: { message: 'network down' } };

    await expect(loadChangelogRows('user-offline-empty')).resolves.toBeNull();
  });

  it('treats an empty server list as authoritative instead of resurrecting the cache', async () => {
    const userId = 'user-empty-server';
    await seedFreshCache(userId);
    server.result = { data: [], error: null };

    await expect(loadChangelogRows(userId)).resolves.toEqual([]);
  });
});
