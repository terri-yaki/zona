import { AppState } from 'react-native';
import { REALTIME_SUBSCRIBE_STATES, RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

type ChannelFactory = () => RealtimeChannel;

type SubscribeWithRetryOptions = {
  onSubscribed?: () => void;
  retryMs?: number;
};

// Consecutive failures back off exponentially up to one attempt per minute so
// a prolonged outage does not turn into a fixed-rate reconnect churn loop.
const maxRetryMs = 60_000;
// Callers refresh their data on every onSubscribed; suppress repeats inside
// this window so a flapping connection cannot amplify into reload storms.
const onSubscribedMinIntervalMs = 30_000;

/**
 * Subscribes a Realtime channel and silently recreates it after transient
 * failures. The factory must return a fresh, unsubscribed channel instance;
 * realtime-js throws when re-subscribing a channel that has already joined,
 * so we always remove the old channel and create a new one on retry.
 *
 * The first retry runs after `retryMs` (default 5 seconds) and consecutive
 * failures back off up to {@link maxRetryMs}. Retries do not run while the
 * app is backgrounded: the attempt is deferred and executed on the next
 * foreground transition, unless the channel recovered by itself meanwhile.
 */
export function subscribeWithRetry(
  createChannel: ChannelFactory,
  { onSubscribed, retryMs = 5_000 }: SubscribeWithRetryOptions = {},
): () => void {
  let current = createChannel();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let attempts = 0;
  let foregroundWait: { remove: () => void } | null = null;
  let lastSubscribedAt = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const clearForegroundWait = () => {
    foregroundWait?.remove();
    foregroundWait = null;
  };

  const retry = (channel: RealtimeChannel) => {
    if (disposed || channel !== current) return;
    if (AppState.currentState !== 'active') {
      // Reconnecting a websocket while backgrounded is wasted work; hold the
      // attempt and run it on the next foreground transition instead.
      if (!foregroundWait) {
        foregroundWait = AppState.addEventListener('change', (state) => {
          if (state !== 'active') return;
          clearForegroundWait();
          retry(channel);
        });
      }
      return;
    }
    void supabase.removeChannel(channel);
    const next = createChannel();
    current = next;
    subscribe(next);
  };

  const scheduleRetry = (channel: RealtimeChannel) => {
    clearTimer();
    attempts += 1;
    const delay = Math.min(retryMs * 2 ** (attempts - 1), maxRetryMs);
    timer = setTimeout(() => {
      timer = null;
      retry(channel);
    }, delay);
  };

  const subscribe = (channel: RealtimeChannel) => {
    channel.subscribe((status) => {
      // Ignore callbacks from a channel we have already replaced, and from a
      // subscription the cleanup has torn down: removeChannel fires a CLOSED
      // status that must not resurrect a disposed helper.
      if (disposed || channel !== current) return;

      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        // realtime-js rejoins internally after transient errors, so a healthy
        // channel must cancel any retry (or deferred foreground retry) that
        // is still pending for it.
        clearTimer();
        clearForegroundWait();
        attempts = 0;
        const now = Date.now();
        if (now - lastSubscribedAt >= onSubscribedMinIntervalMs) {
          lastSubscribedAt = now;
          onSubscribed?.();
        }
        return;
      }

      if (
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
        || status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        || status === REALTIME_SUBSCRIBE_STATES.CLOSED
      ) {
        scheduleRetry(channel);
      }
    });
  };

  subscribe(current);

  return () => {
    disposed = true;
    clearTimer();
    clearForegroundWait();
    void supabase.removeChannel(current);
  };
}
