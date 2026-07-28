import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cachePolicies } from '@/cache/policies';
import { registerCacheResetter } from '@/cache/session';
import {
  currentCacheLease,
  isCacheLeaseCurrent,
  markCacheDirty,
  readCache,
  writeCache,
} from '@/cache/store';
import { listSources } from '@/data/sources';
import { syncAndroidSourceNotificationChannels } from '@/lib/android-source-notifications';
import { useAuth } from '@/providers/AuthProvider';
import { translate } from '@/i18n';
import type { Source } from '@/types';

type SourceCacheEntry = { fetchedAt: number; values: Source[] };

const sourceCache = new Map<string, SourceCacheEntry>();

function sourceVariant(includeRevoked: boolean) {
  return includeRevoked ? 'with-revoked' : 'active-only';
}

function sourceMemoryKey(ownerUserId: string, includeRevoked: boolean) {
  return `${ownerUserId}|${sourceVariant(includeRevoked)}`;
}

registerCacheResetter((ownerUserId) => {
  for (const key of [...sourceCache.keys()]) {
    if (key.startsWith(`${ownerUserId}|`)) sourceCache.delete(key);
  }
});

export function markSourcesCacheDirty(ownerUserId: string) {
  for (const [key, entry] of sourceCache.entries()) {
    if (key.startsWith(`${ownerUserId}|`)) sourceCache.set(key, { ...entry, fetchedAt: 0 });
  }
  void markCacheDirty(ownerUserId, 'sources').catch(() => undefined);
}

export function useSources(includeRevoked = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const cacheKey = userId ? sourceMemoryKey(userId, includeRevoked) : 'signed-out';
  const variant = sourceVariant(includeRevoked);
  const cached = sourceCache.get(cacheKey);
  const [sourceState, setSourceState] = useState<{ cacheKey: string; fetchedAt: number; values: Source[] }>({
    cacheKey,
    fetchedAt: cached?.fetchedAt ?? 0,
    values: cached?.values ?? [],
  });
  const sources = sourceState.cacheKey === cacheKey ? sourceState.values : cached?.values ?? [];
  const fetchedAt = sourceState.cacheKey === cacheKey ? sourceState.fetchedAt : cached?.fetchedAt ?? 0;
  const [hydratedCacheKey, setHydratedCacheKey] = useState<string | null>(cached ? cacheKey : null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const request = ++generation.current;
    const memory = sourceCache.get(cacheKey);
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active || request !== generation.current) return;
      if (!userId) {
        setSourceState({ cacheKey, fetchedAt: 0, values: [] });
        setHydratedCacheKey(cacheKey);
        setLoading(false);
        return;
      }
      if (memory) {
        setSourceState({ cacheKey, ...memory });
        setHydratedCacheKey(cacheKey);
        setLoading(false);
        return;
      }

      setSourceState({ cacheKey, fetchedAt: 0, values: [] });
      setHydratedCacheKey(null);
      setLoading(true);
      try {
        const disk = await readCache<Source[]>(userId, 'sources', variant);
        if (request !== generation.current) return;
        if (disk.value) {
          const entry = { fetchedAt: disk.fetchedAt, values: disk.value };
          sourceCache.set(cacheKey, entry);
          setSourceState({ cacheKey, ...entry });
          setLoading(false);
        }
      } catch (storageError) {
        console.warn('Could not hydrate the source cache.', storageError);
      } finally {
        if (request === generation.current) setHydratedCacheKey(cacheKey);
      }
    });
    return () => { active = false; };
  }, [cacheKey, userId, variant]);

  const commit = useCallback((next: Source[], nextFetchedAt = Date.now()) => {
    if (!userId) return;
    const entry = { fetchedAt: nextFetchedAt, values: next };
    sourceCache.set(cacheKey, entry);
    setSourceState({ cacheKey, ...entry });
    const lease = currentCacheLease(userId);
    void writeCache(userId, 'sources', variant, next, { fetchedAt: nextFetchedAt, lease })
      .catch((storageError) => console.warn('Could not cache sources.', storageError));
  }, [cacheKey, userId, variant]);

  const load = useCallback(async (refresh = false) => {
    if (!userId) return;
    const request = ++generation.current;
    const lease = currentCacheLease(userId);
    if (refresh) setRefreshing(true);
    else if (!sourceCache.has(cacheKey)) setLoading(true);
    setError(null);
    try {
      const next = await listSources({ includeRevoked });
      if (request === generation.current && isCacheLeaseCurrent(lease)) {
        commit(next);
        void syncAndroidSourceNotificationChannels(next).catch((channelError) => {
          console.warn('Could not synchronize Android source notification channels.', channelError);
        });
      }
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught : new Error(translate('error.loadTitle')));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheKey, commit, includeRevoked, userId]);

  const patchSource = useCallback((sourceId: string, patch: (source: Source) => Source) => {
    const base = sourceCache.get(cacheKey)?.values
      ?? (sourceState.cacheKey === cacheKey ? sourceState.values : []);
    commit(base.map((source) => (source.id === sourceId ? patch(source) : source)));
  }, [cacheKey, commit, sourceState]);

  useFocusEffect(useCallback(() => {
    if (!userId || hydratedCacheKey !== cacheKey) return;
    const latestFetchedAt = sourceCache.get(cacheKey)?.fetchedAt ?? fetchedAt;
    const fresh = latestFetchedAt > 0
      && Date.now() - latestFetchedAt <= cachePolicies.sources.freshForMs;
    if (!fresh) void load();
  }, [cacheKey, fetchedAt, hydratedCacheKey, load, userId]));

  return {
    error,
    load,
    loading,
    patchSource,
    refresh: () => load(true),
    refreshing,
    sources,
  };
}
