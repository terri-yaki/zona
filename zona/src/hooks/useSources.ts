import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { listSources } from '@/data/sources';
import { useAuth } from '@/providers/AuthProvider';
import { translate } from '@/i18n';
import type { Source } from '@/types';

const sourceCache = new Map<string, Source[]>();

export function useSources(includeRevoked = true) {
  const { session } = useAuth();
  const cacheKey = `${session?.user.id ?? 'signed-out'}:${includeRevoked}`;
  const cached = sourceCache.get(cacheKey);
  const [sourceState, setSourceState] = useState<{ cacheKey: string; values: Source[] }>({
    cacheKey,
    values: cached ?? [],
  });
  const sources = sourceState.cacheKey === cacheKey ? sourceState.values : cached ?? [];
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);

  const commit = useCallback((next: Source[]) => {
    sourceCache.set(cacheKey, next);
    setSourceState({ cacheKey, values: next });
  }, [cacheKey]);

  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current;
    if (refresh) setRefreshing(true);
    else if (!sourceCache.has(cacheKey)) setLoading(true);
    setError(null);
    try {
      const next = await listSources({ includeRevoked });
      if (request === generation.current) commit(next);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught : new Error(translate('error.loadTitle')));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheKey, commit, includeRevoked]);

  const patchSource = useCallback((sourceId: string, patch: (source: Source) => Source) => {
    setSourceState((previous) => {
      const base = previous.cacheKey === cacheKey
        ? previous.values
        : sourceCache.get(cacheKey) ?? [];
      const next = base.map((source) => (source.id === sourceId ? patch(source) : source));
      sourceCache.set(cacheKey, next);
      return { cacheKey, values: next };
    });
  }, [cacheKey]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

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
