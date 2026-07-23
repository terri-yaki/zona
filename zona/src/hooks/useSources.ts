import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { listSources } from '@/data/sources';
import type { Source } from '@/types';

export function useSources(includeRevoked = true) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const next = await listSources({ includeRevoked });
      if (request === generation.current) setSources(next);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught : new Error('Your sources could not be loaded.'));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [includeRevoked]);

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
