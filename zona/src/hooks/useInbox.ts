import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cachePolicies } from '@/cache/policies';
import { registerCacheResetter } from '@/cache/session';
import {
  currentCacheLease,
  markCacheDirty,
  readCache,
  writeCache,
} from '@/cache/store';
import {
  getInboxSnapshot,
  listNotifications,
  markAllNotificationsRead,
  type InboxCursor,
  type InboxFilters,
} from '@/data/notifications';
import { runOnForeground } from '@/lib/foreground';
import { syncInboxWidget } from '@/lib/inbox-widget';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { FOREGROUND_REFRESH_TIMEOUT_MS, withTimeout } from '@/lib/timeout';
import type { InboxNotification } from '@/types';

type InboxPageCache = {
  cursor: InboxCursor | null;
  fetchedAt: number;
  hasMore: boolean;
  items: InboxNotification[];
  unreadCount: number;
  variant: string;
};

type StoredInboxPage = Omit<InboxPageCache, 'fetchedAt' | 'variant'>;

const maxCachedInboxItems = 200;
const pageCache = new Map<string, InboxPageCache>();
const unreadCountByUser = new Map<string, number>();

registerCacheResetter((ownerUserId) => {
  unreadCountByUser.delete(ownerUserId);
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(`${ownerUserId}|`)) pageCache.delete(key);
  }
});

function filterCacheVariant(filters: InboxFilters, pageSize: number) {
  return [
    'v2',
    filters.sourceId ?? 'all',
    filters.unreadOnly ? 'unread' : 'all',
    filters.since ?? 'anytime',
    filters.pinnedOnly ? 'pinned' : 'all-pins',
    filters.severity ?? 'all-severity',
    (filters.searchQuery ?? '').trim().toLocaleLowerCase(),
    String(pageSize),
  ].join('|');
}

function memoryCacheKey(userId: string, variant: string) {
  return `${userId}|${variant}`;
}

function mergeUnique(current: InboxNotification[], next: InboxNotification[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

function isFresh(entry: InboxPageCache) {
  return Date.now() - entry.fetchedAt <= cachePolicies.inbox.freshForMs;
}

function rememberPage(
  ownerUserId: string,
  variant: string,
  value: StoredInboxPage,
  fetchedAt = Date.now(),
) {
  const bounded = { ...value, items: value.items.slice(0, maxCachedInboxItems) };
  const freshKey = memoryCacheKey(ownerUserId, variant);
  pageCache.set(freshKey, { ...bounded, fetchedAt, variant });
  // Bound the in-memory map: timestamp-based filter variants would otherwise
  // add a new entry on every toggle with nothing ever removing them.
  const maxPageCacheEntriesPerUser = 8;
  const prefix = `${ownerUserId}|`;
  const userKeys = [...pageCache.keys()].filter((key) => key.startsWith(prefix));
  let removed = 0;
  for (const key of userKeys) {
    if (removed >= userKeys.length - maxPageCacheEntriesPerUser) break;
    if (key === freshKey) continue;
    pageCache.delete(key);
    removed += 1;
  }
  unreadCountByUser.set(ownerUserId, value.unreadCount);
  void writeCache(ownerUserId, 'inbox', variant, bounded, {
    fetchedAt,
    lease: currentCacheLease(ownerUserId),
  }).catch((error) => console.warn('Could not save the inbox cache.', error));
}

function markMemoryPagesDirty(ownerUserId: string) {
  for (const [key, entry] of pageCache.entries()) {
    if (key.startsWith(`${ownerUserId}|`)) pageCache.set(key, { ...entry, fetchedAt: 0 });
  }
}

function markMemoryItemsRead(ownerUserId: string, readAt: string) {
  unreadCountByUser.set(ownerUserId, 0);
  for (const [key, entry] of pageCache.entries()) {
    if (!key.startsWith(`${ownerUserId}|`)) continue;
    const unreadOnly = entry.variant.split('|')[1] === 'unread';
    const updated: StoredInboxPage = unreadOnly
      ? { cursor: null, hasMore: false, items: [], unreadCount: 0 }
      : {
        cursor: entry.cursor,
        hasMore: entry.hasMore,
        items: entry.items.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
        unreadCount: 0,
      };
    rememberPage(ownerUserId, entry.variant, updated);
  }
}

function userHasAnyCache(ownerUserId: string) {
  for (const key of pageCache.keys()) {
    if (key.startsWith(`${ownerUserId}|`)) return true;
  }
  return false;
}

export function useInbox(userId: string, filters: InboxFilters, pageSize = 30, widgetEnabled = true) {
  const cacheVariant = filterCacheVariant(filters, pageSize);
  const widgetEligible = !filters.sourceId
    && !filters.unreadOnly
    && !filters.since
    && !filters.pinnedOnly
    && !filters.severity
    && !(filters.searchQuery ?? '').trim();
  const cacheKey = memoryCacheKey(userId, cacheVariant);
  const cachedPage = pageCache.get(cacheKey);

  const [items, setItems] = useState<InboxNotification[]>(() => cachedPage?.items ?? []);
  const [unreadCount, setUnreadCount] = useState(() => unreadCountByUser.get(userId) ?? 0);
  const [cursor, setCursor] = useState<InboxCursor | null>(() => cachedPage?.cursor ?? null);
  const [hasMore, setHasMore] = useState(() => cachedPage?.hasMore ?? false);
  const [bootstrapping, setBootstrapping] = useState(() => !cachedPage && !userHasAnyCache(userId));
  const [filterLoading, setFilterLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasEverLoaded, setHasEverLoaded] = useState(() => Boolean(cachedPage) || userHasAnyCache(userId));
  const generation = useRef(0);
  // Per-flow counters for spinner clearing: the shared `generation` guards
  // result staleness, but a loadMore bump must not block load's finally from
  // clearing refreshing/bootstrapping (and vice versa for loadingMore).
  const loadGeneration = useRef(0);
  const loadMoreGeneration = useRef(0);
  const cacheKeyRef = useRef(cacheKey);
  const cacheVariantRef = useRef(cacheVariant);
  // In-flight load for the current cache key. Cold start fires both the focus
  // effect and the foreground handler; the second caller joins the in-flight
  // load instead of issuing a duplicate fetch, and a refresh/realtime join
  // upgrades it so it never short-circuits on a fresh cache.
  const loadInFlightRef = useRef<{ key: string; refresh: boolean } | null>(null);

  useEffect(() => {
    cacheKeyRef.current = cacheKey;
    cacheVariantRef.current = cacheVariant;
  }, [cacheKey, cacheVariant]);

  const [appliedCacheKey, setAppliedCacheKey] = useState(cacheKey);
  if (appliedCacheKey !== cacheKey) {
    setAppliedCacheKey(cacheKey);
    const entry = pageCache.get(cacheKey);
    setItems(entry?.items ?? []);
    setCursor(entry?.cursor ?? null);
    setHasMore(entry?.hasMore ?? false);
    setUnreadCount(entry?.unreadCount ?? unreadCountByUser.get(userId) ?? 0);
    setError(null);
    setBootstrapping(!entry && !hasEverLoaded);
    setFilterLoading(!entry && hasEverLoaded);
    setRefreshing(false);
    setLoadingMore(false);
  }

  const applyPage = useCallback((page: StoredInboxPage, fetchedAt = Date.now()) => {
    setItems(page.items);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setUnreadCount(page.unreadCount);
    setHasEverLoaded(true);
    rememberPage(userId, cacheVariantRef.current, page, fetchedAt);
    if (widgetEligible && widgetEnabled) syncInboxWidget(page.items, page.unreadCount);
  }, [userId, widgetEligible, widgetEnabled]);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'realtime' | 'soft' = 'initial') => {
    const key = cacheKeyRef.current;
    const inFlight = loadInFlightRef.current;
    if (inFlight && inFlight.key === key) {
      if (mode === 'refresh') {
        inFlight.refresh = true;
        setRefreshing(true);
      } else if (mode === 'realtime') {
        inFlight.refresh = true;
      }
      return;
    }
    const context = { key, refresh: mode === 'refresh' || mode === 'realtime' };
    loadInFlightRef.current = context;
    const request = ++generation.current;
    const loadRequest = ++loadGeneration.current;
    const variant = cacheVariantRef.current;
    let memory = pageCache.get(key);

    if (mode === 'refresh') setRefreshing(true);
    else if (!memory && !hasEverLoaded) setBootstrapping(true);
    else if (!memory && hasEverLoaded) setFilterLoading(true);
    setError(null);

    try {
      if (!memory && mode !== 'realtime') {
        const cached = await withTimeout(
          readCache<StoredInboxPage>(userId, 'inbox', variant),
          FOREGROUND_REFRESH_TIMEOUT_MS,
          translate('error.connection'),
        ).catch(() => null);
        if (request !== generation.current || key !== cacheKeyRef.current) return;
        if (cached?.value) {
          applyPage(cached.value, cached.fetchedAt);
          memory = pageCache.get(key);
          setBootstrapping(false);
          setFilterLoading(false);
          if (cached.state === 'fresh' && !context.refresh) return;
        }
      }

      if (!context.refresh && memory && isFresh(memory)) return;

      const snapshot = await withTimeout(
        getInboxSnapshot(filters, pageSize),
        FOREGROUND_REFRESH_TIMEOUT_MS,
        translate('error.connection'),
      );
      if (request !== generation.current || key !== cacheKeyRef.current) return;
      applyPage(snapshot);
    } catch (caught) {
      if (request === generation.current && key === cacheKeyRef.current) {
        setError(caught instanceof Error ? caught : new Error(translate('error.loadTitle')));
      }
    } finally {
      if (loadInFlightRef.current === context) loadInFlightRef.current = null;
      if (loadRequest === loadGeneration.current && key === cacheKeyRef.current) {
        setBootstrapping(false);
        setFilterLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyPage, filters, hasEverLoaded, pageSize, userId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    const request = ++generation.current;
    const moreRequest = ++loadMoreGeneration.current;
    const key = cacheKeyRef.current;
    setLoadingMore(true);
    try {
      const page = await withTimeout(
        listNotifications(filters, cursor, pageSize),
        FOREGROUND_REFRESH_TIMEOUT_MS,
        translate('error.connection'),
      );
      if (request !== generation.current || key !== cacheKeyRef.current) return;
      const merged = mergeUnique(items, page.items);
      const updated = {
        cursor: page.cursor,
        hasMore: page.hasMore,
        items: merged,
        unreadCount,
      };
      setItems(merged);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      rememberPage(userId, cacheVariantRef.current, updated);
    } catch (caught) {
      if (request === generation.current && key === cacheKeyRef.current) {
        setError(caught instanceof Error ? caught : new Error(translate('error.loadTitle')));
      }
    } finally {
      if (moreRequest === loadMoreGeneration.current && key === cacheKeyRef.current) setLoadingMore(false);
    }
  }, [cursor, filters, hasMore, items, loadingMore, pageSize, unreadCount, userId]);

  const markAllRead = useCallback(async () => {
    if (markingAllRead || unreadCount === 0) return;
    setMarkingAllRead(true);
    setError(null);
    try {
      const readAt = new Date().toISOString();
      await withTimeout(
        markAllNotificationsRead(readAt),
        FOREGROUND_REFRESH_TIMEOUT_MS,
        translate('error.connection'),
      );
      markMemoryItemsRead(userId, readAt);
      void markCacheDirty(userId, 'inbox').catch(() => undefined);
      setUnreadCount(0);
      if (filters.unreadOnly) {
        setItems([]);
        setCursor(null);
        setHasMore(false);
      } else {
        setItems((current) => current.map((item) => (
          item.read_at ? item : { ...item, read_at: readAt }
        )));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(translate('inbox.markReadError')));
    } finally {
      setMarkingAllRead(false);
    }
  }, [filters.unreadOnly, markingAllRead, unreadCount, userId]);

  useFocusEffect(useCallback(() => {
    void load(pageCache.has(cacheKeyRef.current) || hasEverLoaded ? 'soft' : 'initial');
  }, [hasEverLoaded, load]));

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Stable subscription: loadRef keeps the channel alive across filter changes
  // instead of tearing down and re-subscribing on every toggle.
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`zona:inbox:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          markMemoryPagesDirty(userId);
          void markCacheDirty(userId, 'inbox').catch(() => undefined);
          void loadRef.current('realtime');
        }, 200);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // Fresh open and every return to the foreground pull the server, no
    // matter how fresh the cache is; cached rows still paint first.
    return runOnForeground(() => {
      void loadRef.current('refresh');
    });
  }, [userId]);

  return {
    bootstrapping,
    error,
    filterLoading,
    hasMore,
    items,
    loadingMore,
    loadMore,
    markAllRead,
    markingAllRead,
    refresh: () => load('refresh'),
    refreshing,
    retry: () => load(pageCache.has(cacheKey) || hasEverLoaded ? 'soft' : 'initial'),
    unreadCount,
  };
}
