import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  type InboxCursor,
  type InboxFilters,
  unreadNotificationCount,
} from '@/data/notifications';
import { supabase } from '@/lib/supabase';
import type { InboxNotification } from '@/types';

type InboxPageCache = {
  items: InboxNotification[];
  cursor: InboxCursor | null;
  hasMore: boolean;
  fetchedAt: number;
};

const pageCache = new Map<string, InboxPageCache>();
let cachedUnreadCount = 0;

function filterCacheKey(userId: string, filters: InboxFilters) {
  return [
    userId,
    filters.sourceId ?? '',
    filters.unreadOnly ? '1' : '0',
    filters.since ?? '',
  ].join('|');
}

function mergeUnique(current: InboxNotification[], next: InboxNotification[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

function writePageCache(key: string, entry: Omit<InboxPageCache, 'fetchedAt'>) {
  pageCache.set(key, { ...entry, fetchedAt: Date.now() });
}

function invalidateInboxCache(userId?: string) {
  if (!userId) {
    pageCache.clear();
    return;
  }
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(`${userId}|`)) pageCache.delete(key);
  }
}

function markCacheItemsRead(userId: string, readAt: string) {
  for (const [key, entry] of pageCache.entries()) {
    if (!key.startsWith(`${userId}|`)) continue;
    pageCache.set(key, {
      ...entry,
      items: entry.items.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
      fetchedAt: Date.now(),
    });
  }
}

export function useInbox(userId: string, filters: InboxFilters) {
  const cacheKey = useMemo(
    () => filterCacheKey(userId, filters),
    // filters is recreated in the screen when chips change; key off its fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable key from primitive filter fields
    [userId, filters.sourceId, filters.unreadOnly, filters.since],
  );
  const cachedPage = pageCache.get(cacheKey);

  const [items, setItems] = useState<InboxNotification[]>(() => cachedPage?.items ?? []);
  const [unreadCount, setUnreadCount] = useState(() => cachedUnreadCount);
  const [cursor, setCursor] = useState<InboxCursor | null>(() => cachedPage?.cursor ?? null);
  const [hasMore, setHasMore] = useState(() => cachedPage?.hasMore ?? false);
  const [loading, setLoading] = useState(() => !cachedPage);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  // Swap to cached results instantly when the filter chip changes.
  useEffect(() => {
    const entry = pageCache.get(cacheKey);
    if (entry) {
      setItems(entry.items);
      setCursor(entry.cursor);
      setHasMore(entry.hasMore);
      setLoading(false);
      setError(null);
      return;
    }
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setLoading(true);
    setError(null);
  }, [cacheKey]);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'realtime' | 'soft' = 'initial') => {
    const request = ++generation.current;
    const key = cacheKeyRef.current;
    const hasCache = pageCache.has(key);

    if (mode === 'refresh') setRefreshing(true);
    else if ((mode === 'initial' || mode === 'soft') && !hasCache) setLoading(true);
    // With cache: keep the list on screen (no full-screen hard load).

    setError(null);
    try {
      const [page, count] = await Promise.all([
        listNotifications(filters),
        unreadNotificationCount(),
      ]);
      if (request !== generation.current || key !== cacheKeyRef.current) return;

      setItems(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setUnreadCount(count);
      cachedUnreadCount = count;
      writePageCache(key, {
        items: page.items,
        cursor: page.cursor,
        hasMore: page.hasMore,
      });
    } catch (caught) {
      if (request === generation.current && key === cacheKeyRef.current) {
        setError(caught instanceof Error ? caught : new Error('Your inbox could not be loaded.'));
      }
    } finally {
      if (request === generation.current && key === cacheKeyRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    const request = ++generation.current;
    const key = cacheKeyRef.current;
    setLoadingMore(true);
    try {
      const page = await listNotifications(filters, cursor);
      if (request !== generation.current || key !== cacheKeyRef.current) return;
      setItems((current) => {
        const merged = mergeUnique(current, page.items);
        writePageCache(key, {
          items: merged,
          cursor: page.cursor,
          hasMore: page.hasMore,
        });
        return merged;
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      if (request === generation.current && key === cacheKeyRef.current) {
        setError(caught instanceof Error ? caught : new Error('More notifications could not be loaded.'));
      }
    } finally {
      if (request === generation.current && key === cacheKeyRef.current) setLoadingMore(false);
    }
  }, [cursor, filters, hasMore, loadingMore]);

  const markAllRead = useCallback(async () => {
    if (markingAllRead || unreadCount === 0) return;
    setMarkingAllRead(true);
    setError(null);
    try {
      const readAt = new Date().toISOString();
      await markAllNotificationsRead(readAt);
      setItems((current) => current.map((item) => (
        item.read_at ? item : { ...item, read_at: readAt }
      )));
      setUnreadCount(0);
      cachedUnreadCount = 0;
      markCacheItemsRead(userId, readAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Notifications could not be marked as read.'));
    } finally {
      setMarkingAllRead(false);
    }
  }, [markingAllRead, unreadCount, userId]);

  // load identity changes with filters → revalidate current filter without blanking the UI when cached.
  useFocusEffect(useCallback(() => {
    void load(pageCache.has(cacheKeyRef.current) ? 'soft' : 'initial');
  }, [load]));

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`inbox-${userId}`)
      .on('postgres_changes', {
        event: '*',
        filter: `user_id=eq.${userId}`,
        schema: 'public',
        table: 'notifications',
      }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          invalidateInboxCache(userId);
          void load('realtime');
        }, 200);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  return {
    error,
    hasMore,
    items,
    loading,
    loadingMore,
    loadMore,
    markAllRead,
    markingAllRead,
    refresh: () => load('refresh'),
    refreshing,
    retry: () => load(pageCache.has(cacheKey) ? 'soft' : 'initial'),
    unreadCount,
  };
}
