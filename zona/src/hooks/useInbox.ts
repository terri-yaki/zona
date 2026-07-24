import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  type InboxCursor,
  type InboxFilters,
  unreadNotificationCount,
} from '@/data/notifications';
import { supabase } from '@/lib/supabase';
import type { InboxNotification } from '@/types';

function mergeUnique(current: InboxNotification[], next: InboxNotification[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

export function useInbox(userId: string, filters: InboxFilters) {
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState<InboxCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'realtime' = 'initial') => {
    const request = ++generation.current;
    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'initial') setLoading(true);
    setError(null);
    try {
      const [page, count] = await Promise.all([
        listNotifications(filters),
        unreadNotificationCount(),
      ]);
      if (request !== generation.current) return;
      setItems(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setUnreadCount(count);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught : new Error('Your inbox could not be loaded.'));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    const request = ++generation.current;
    setLoadingMore(true);
    try {
      const page = await listNotifications(filters, cursor);
      if (request !== generation.current) return;
      setItems((current) => mergeUnique(current, page.items));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught : new Error('More notifications could not be loaded.'));
    } finally {
      if (request === generation.current) setLoadingMore(false);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Notifications could not be marked as read.'));
    } finally {
      setMarkingAllRead(false);
    }
  }, [markingAllRead, unreadCount]);

  useFocusEffect(useCallback(() => {
    void load('initial');
  }, [load]));

  useEffect(() => {
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
        timer = setTimeout(() => void load('realtime'), 200);
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
    retry: () => load('initial'),
    unreadCount,
  };
}
