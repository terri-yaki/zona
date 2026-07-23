import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { listSources } from '@/data/sources';
import { useAuth } from '@/providers/AuthProvider';
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

  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current;
    if (refresh) setRefreshing(true);
    else if (!sourceCache.has(cacheKey)) setLoading(true);
    setError(null);
    try {
      const next = await listSources({ includeRevoked });
      if (request === generation.current) {
        sourceCache.set(cacheKey, next);
        setSourceState({ cacheKey, values: next });
      }
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught : new Error('Your sources could not be loaded.'));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheKey, includeRevoked]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return {
    error,
    load,
    loading,
    refresh: () => load(true),
    refreshing,
    sources,
  };
}
