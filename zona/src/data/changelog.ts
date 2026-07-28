import { Platform } from 'react-native';

import { cachePolicies } from '@/cache/policies';
import { registerCacheResetter } from '@/cache/session';
import {
  currentCacheLease,
  isCacheLeaseCurrent,
  readCache,
  writeCache,
} from '@/cache/store';
import { parseChangelogRows, type ChangelogRow } from '@/lib/changelog';
import { supabase } from '@/lib/supabase';

type ChangelogCacheEntry = { fetchedAt: number; rows: ChangelogRow[] };

const cacheVariant = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
const changelogCache = new Map<string, ChangelogCacheEntry>();
const inFlight = new Map<string, Promise<ChangelogRow[] | null>>();

registerCacheResetter((ownerUserId) => {
  changelogCache.delete(ownerUserId);
  inFlight.delete(ownerUserId);
});

export async function getCachedChangelogRows(ownerUserId: string) {
  const memory = changelogCache.get(ownerUserId);
  if (memory) {
    const fresh = Date.now() - memory.fetchedAt <= cachePolicies.changelog.freshForMs;
    return { fetchedAt: memory.fetchedAt, rows: memory.rows, state: fresh ? 'fresh' as const : 'stale' as const };
  }
  const cached = await readCache<ChangelogRow[]>(ownerUserId, 'changelog', cacheVariant);
  if (!cached.value) return { fetchedAt: 0, rows: null, state: 'miss' as const };
  changelogCache.set(ownerUserId, { fetchedAt: cached.fetchedAt, rows: cached.value });
  return { fetchedAt: cached.fetchedAt, rows: cached.value, state: cached.state };
}

/**
 * Server-driven What's New content from the normalized release tables.
 * Returns null only when the backend is unavailable; an empty array is an
 * authoritative operator choice and must not resurrect bundled releases.
 */
export async function fetchChangelogRows(ownerUserId: string): Promise<ChangelogRow[] | null> {
  const existing = inFlight.get(ownerUserId);
  if (existing) return existing;
  const lease = currentCacheLease(ownerUserId);
  const request = (async () => {
    const { data, error } = await supabase
      .from('app_release_notes')
      .select('id, version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, app_release_note_items(id, item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position, is_active, platform)')
      .eq('is_active', true)
      .order('released_at', { ascending: false });
    if (error) {
      console.warn('Could not load the server changelog; using cached or bundled copy.', error);
      return null;
    }
    const compatibleRows = (data ?? []).map((row) => ({
      ...row,
      items: [...row.app_release_note_items]
        .filter((item) => item.platform === null || item.platform === Platform.OS)
        .sort((left, right) => left.position - right.position)
        .map((item) => ({
          key: item.item_key,
          icon: item.icon_name,
          title_en: item.title_en,
          title_zh_hant: item.title_zh_hant,
          body_en: item.body_en,
          body_zh_hant: item.body_zh_hant,
          is_active: item.is_active,
        })),
    }));
    const rows = parseChangelogRows(compatibleRows);
    if (isCacheLeaseCurrent(lease)) {
      const fetchedAt = Date.now();
      changelogCache.set(ownerUserId, { fetchedAt, rows });
      try {
        await writeCache(ownerUserId, 'changelog', cacheVariant, rows, { fetchedAt, lease });
      } catch (storageError) {
        console.warn('Could not cache What’s New.', storageError);
      }
    }
    return rows;
  })().finally(() => inFlight.delete(ownerUserId));
  inFlight.set(ownerUserId, request);
  return request;
}
