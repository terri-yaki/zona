import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listSourceAccessKeys } from '@/data/sources';
import { translate } from '@/i18n';
import type { SourceAccessKey } from '@/types';

export function useSourceAccessKeys(sourceId: string | null) {
  const [keys, setKeys] = useState<SourceAccessKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!sourceId) {
      setKeys([]);
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setKeys(await listSourceAccessKeys(sourceId));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(translate('sourceKeys.loadError')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sourceId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return {
    error,
    keys,
    load,
    loading,
    refresh: () => load(true),
    refreshing,
  };
}
