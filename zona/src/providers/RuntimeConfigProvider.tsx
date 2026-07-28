import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { fetchAppBootstrap } from '@/data/bootstrap';
import {
  defaultRuntimeSnapshot,
  featureEnabled,
  featureVisible,
  parseRuntimeSnapshot,
  type FeatureKey,
  type RuntimeSnapshot,
} from '@/lib/runtime-controls';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { supabase } from '@/lib/supabase';

type CachedSnapshot = { fetchedAt: number; snapshot: RuntimeSnapshot };
type RuntimeConfigContextValue = {
  snapshot: RuntimeSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isVisible: (key: FeatureKey) => boolean;
  isEnabled: (key: FeatureKey) => boolean;
};

const RuntimeConfigContext = createContext<RuntimeConfigContextValue>({
  snapshot: defaultRuntimeSnapshot,
  loading: false,
  error: null,
  refresh: async () => undefined,
  isVisible: () => true,
  isEnabled: () => true,
});

const cachePrefix = 'zona.runtime-config.v1';
const inFlight = new Map<string, Promise<RuntimeSnapshot>>();

function cacheKey(userId: string, language: string) {
  return `${cachePrefix}.${userId}.${language}`;
}

function loadOnce(key: string, loader: () => Promise<RuntimeSnapshot>) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = loader().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export function RuntimeConfigProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const { language } = useI18n();
  const userId = session?.user.id ?? null;
  const key = userId ? cacheKey(userId, language) : null;
  const [snapshot, setSnapshot] = useState(defaultRuntimeSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedAt = useRef(0);
  const activeKey = useRef<string | null>(key);

  useEffect(() => {
    activeKey.current = key;
  }, [key]);

  const refresh = useCallback(async () => {
    if (!key || !userId) return;
    setLoading(true);
    try {
      const next = await loadOnce(key, () => fetchAppBootstrap(language));
      if (activeKey.current !== key) return;
      const now = Date.now();
      setSnapshot(next);
      fetchedAt.current = now;
      setError(null);
      const cached: CachedSnapshot = { fetchedAt: now, snapshot: next };
      try {
        await AsyncStorage.setItem(key, JSON.stringify(cached));
      } catch (storageError) {
        console.warn('Could not cache runtime configuration.', storageError);
      }
    } catch (caught) {
      if (activeKey.current === key) {
        setError(caught instanceof Error ? caught.message : 'Runtime configuration is unavailable.');
      }
    } finally {
      if (activeKey.current === key) setLoading(false);
    }
  }, [key, language, userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let raw: string | null = null;
      try {
        raw = key ? await AsyncStorage.getItem(key) : null;
      } catch (storageError) {
        console.warn('Could not read cached runtime configuration.', storageError);
      }
      if (!active) return;
      setSnapshot(defaultRuntimeSnapshot);
      fetchedAt.current = 0;
      setError(null);
      if (active && raw) {
        try {
          const cached = JSON.parse(raw) as Partial<CachedSnapshot>;
          const parsed = parseRuntimeSnapshot(cached.snapshot);
          setSnapshot(parsed);
          fetchedAt.current = typeof cached.fetchedAt === 'number' ? cached.fetchedAt : 0;
        } catch {
          if (key) {
            try {
              await AsyncStorage.removeItem(key);
            } catch (storageError) {
              console.warn('Could not remove invalid runtime configuration.', storageError);
            }
          }
        }
      }
      if (active && key) await refresh();
    })();

    return () => { active = false; };
  }, [key, refresh]);

  useEffect(() => {
    if (!key) return;
    const onAppState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const ttl = snapshot.refreshAfterSeconds * 1000;
      if (Date.now() - fetchedAt.current >= ttl) void refresh();
    };
    const subscription = AppState.addEventListener('change', onAppState);
    return () => subscription.remove();
  }, [key, refresh, snapshot.refreshAfterSeconds]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 200);
    };
    const globalChannel = supabase
      .channel('zona:config', { config: { private: true } })
      .on('broadcast', { event: 'changed' }, onChange)
      .subscribe();
    const accountChannel = supabase
      .channel(`zona:config:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, onChange)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(globalChannel);
      void supabase.removeChannel(accountChannel);
    };
  }, [refresh, userId]);

  const value = useMemo<RuntimeConfigContextValue>(() => ({
    snapshot,
    loading,
    error,
    refresh,
    isVisible: (feature) => featureVisible(snapshot, feature),
    isEnabled: (feature) => featureEnabled(snapshot, feature),
  }), [error, loading, refresh, snapshot]);

  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}
