import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { listNotifications, unreadNotificationCount } from '@/data/notifications';
import {
  attachLiveActivityStateListener,
  liveActivityPlatformSupported,
  migrateLegacyLiveActivityPreference,
  syncLiveActivity,
  type ZonaLiveActivitySnapshot,
} from '@/lib/live-activity';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';

const MIN_SYNC_INTERVAL_MS = 2_000;

function emptySnapshot(): ZonaLiveActivitySnapshot {
  return {
    unreadCount: 0,
    latestTitle: null,
    latestSource: null,
    latestId: null,
    latestCreatedAt: null,
  };
}

async function fetchSnapshot(): Promise<ZonaLiveActivitySnapshot> {
  const unreadCount = await unreadNotificationCount();
  if (unreadCount <= 0) return emptySnapshot();

  const { items } = await listNotifications({
    sourceId: null,
    since: null,
    unreadOnly: true,
  });
  const latest = items[0] ?? null;
  return {
    unreadCount,
    latestTitle: latest?.title ?? null,
    latestSource: latest?.source_name_snapshot ?? null,
    latestId: latest?.id ?? null,
    latestCreatedAt: latest?.created_at ?? null,
  };
}

/**
 * Keeps the iOS Live Activity aligned with inbox unread state while the app runs.
 * Mount once under AuthProvider when a session exists.
 */
export function LiveActivitySync() {
  const { session } = useAuth();
  const { language } = useI18n();
  const userId = session?.user.id;
  const inFlight = useRef(false);
  const lastSyncAt = useRef(0);
  const pending = useRef(false);

  const runSync = useCallback(async (force = false) => {
    void language;
    if (!userId || !liveActivityPlatformSupported()) return;

    const now = Date.now();
    if (!force && now - lastSyncAt.current < MIN_SYNC_INTERVAL_MS) {
      pending.current = true;
      return;
    }
    if (inFlight.current) {
      pending.current = true;
      return;
    }

    inFlight.current = true;
    pending.current = false;
    lastSyncAt.current = now;

    try {
      const snapshot = await fetchSnapshot();
      await syncLiveActivity(userId, snapshot);
    } catch (error) {
      console.warn('Live Activity sync failed.', error);
    } finally {
      inFlight.current = false;
      if (pending.current) {
        pending.current = false;
        void runSync(true);
      }
    }
  }, [language, userId]);

  useEffect(() => {
    if (!userId || Platform.OS !== 'ios') return;

    void migrateLegacyLiveActivityPreference(userId).finally(() => {
      void runSync(true);
    });

    let detachState: (() => void) | undefined;
    void attachLiveActivityStateListener()
      .then((detach) => {
        detachState = detach;
      })
      .catch((error) => {
        console.warn('Could not attach the Live Activity state listener.', error);
      });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runSync(true);
    });

    const channel = supabase
      .channel(`live-activity:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void runSync();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_options',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void runSync(true);
        },
      )
      .subscribe();

    return () => {
      detachState?.();
      appStateSub.remove();
      void supabase.removeChannel(channel);
    };
  }, [runSync, userId]);

  return null;
}
