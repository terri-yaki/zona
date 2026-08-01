import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { pruneUserCache } from '@/cache/store';
import { useAuth } from '@/providers/AuthProvider';

export function CacheLifecycleSync() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const prune = () => {
      void pruneUserCache(userId).catch((error) => {
        console.warn('Could not prune the offline cache.', error);
      });
    };
    prune();
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') prune();
    };
    const subscription = AppState.addEventListener('change', onAppState);
    return () => subscription.remove();
  }, [userId]);

  return null;
}
