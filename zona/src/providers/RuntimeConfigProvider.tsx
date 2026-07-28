import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  appBootstrapCacheVariant,
  fetchAppBootstrap,
  getAppBootstrapContext,
  type AppBootstrapContext,
} from '@/data/bootstrap';
import {
  currentCacheLease,
  isCacheLeaseCurrent,
  markCacheDirty,
  readCache,
  writeCache,
} from '@/cache/store';
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

type RuntimeConfigContextValue = {
  snapshot: RuntimeSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isVisible: (key: FeatureKey) => boolean;
  isEnabled: (key: FeatureKey) => boolean;
};

type RuntimeState = {
  fetchedAt: number;
  scopeKey: string | null;
  snapshot: RuntimeSnapshot;
  variant: string | null;
};

type ActiveContext = {
  bootstrap: AppBootstrapContext;
  ownerUserId: string;
  scopeKey: string;
  variant: string;
};

const RuntimeConfigContext = createContext<RuntimeConfigContextValue>({
  snapshot: defaultRuntimeSnapshot,
  loading: false,
  error: null,
  refresh: async () => undefined,
  isVisible: () => true,
  isEnabled: () => true,
});

const inFlight = new Map<string, Promise<RuntimeSnapshot>>();

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
  const scopeKey = userId ? `${userId}|${language}` : null;
  const [state, setState] = useState<RuntimeState>({
    fetchedAt: 0,
    scopeKey: null,
    snapshot: defaultRuntimeSnapshot,
    variant: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeScope = useRef(scopeKey);
  const activeContext = useRef<ActiveContext | null>(null);

  const snapshot = state.scopeKey === scopeKey ? state.snapshot : defaultRuntimeSnapshot;
  const fetchedAt = state.scopeKey === scopeKey ? state.fetchedAt : 0;

  const refresh = useCallback(async () => {
    const target = activeContext.current;
    if (!target || activeScope.current !== target.scopeKey) return;
    const lease = currentCacheLease(target.ownerUserId);
    setLoading(true);
    try {
      const requestKey = `${target.ownerUserId}|${target.variant}`;
      const next = await loadOnce(requestKey, () => fetchAppBootstrap(language, target.bootstrap));
      if (activeScope.current !== target.scopeKey || !isCacheLeaseCurrent(lease)) return;
      const now = Date.now();
      setState({
        fetchedAt: now,
        scopeKey: target.scopeKey,
        snapshot: next,
        variant: target.variant,
      });
      setError(null);
      try {
        await writeCache(target.ownerUserId, 'runtime', target.variant, next, { fetchedAt: now, lease });
      } catch (storageError) {
        console.warn('Could not cache runtime configuration.', storageError);
      }
    } catch (caught) {
      if (activeScope.current === target.scopeKey) {
        setError(caught instanceof Error ? caught.message : 'Runtime configuration is unavailable.');
      }
    } finally {
      if (activeScope.current === target.scopeKey) setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    let active = true;
    activeScope.current = scopeKey;
    activeContext.current = null;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setError(null);
      if (!scopeKey || !userId) {
        setState({ fetchedAt: 0, scopeKey: null, snapshot: defaultRuntimeSnapshot, variant: null });
        setLoading(false);
        return;
      }
      setState({ fetchedAt: 0, scopeKey, snapshot: defaultRuntimeSnapshot, variant: null });
      setLoading(true);
      try {
        const bootstrap = await getAppBootstrapContext(language);
        if (!active || activeScope.current !== scopeKey) return;
        const variant = appBootstrapCacheVariant(bootstrap);
        activeContext.current = { bootstrap, ownerUserId: userId, scopeKey, variant };
        const cached = await readCache<RuntimeSnapshot>(userId, 'runtime', variant, Number.POSITIVE_INFINITY);
        if (!active || activeScope.current !== scopeKey) return;

        let cacheIsFresh = false;
        if (cached.value) {
          const parsed = parseRuntimeSnapshot(cached.value);
          setState({ fetchedAt: cached.fetchedAt, scopeKey, snapshot: parsed, variant });
          cacheIsFresh = cached.state === 'fresh'
            && Date.now() - cached.fetchedAt < parsed.refreshAfterSeconds * 1000;
        }
        if (cacheIsFresh) {
          setLoading(false);
        } else {
          await refresh();
        }
      } catch (caught) {
        if (active && activeScope.current === scopeKey) {
          setLoading(false);
          setError(caught instanceof Error ? caught.message : 'Runtime configuration is unavailable.');
        }
      }
    })();

    return () => { active = false; };
  }, [language, refresh, scopeKey, userId]);

  useEffect(() => {
    if (!scopeKey) return;
    const onAppState = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const ttl = snapshot.refreshAfterSeconds * 1000;
      if (Date.now() - fetchedAt >= ttl) void refresh();
    };
    const subscription = AppState.addEventListener('change', onAppState);
    return () => subscription.remove();
  }, [fetchedAt, refresh, scopeKey, snapshot.refreshAfterSeconds]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void markCacheDirty(userId, 'runtime').catch(() => undefined);
        void refresh();
      }, 200);
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
