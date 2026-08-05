import { AppState } from 'react-native';
import { REALTIME_SUBSCRIBE_STATES, RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

type ChannelFactory = () => RealtimeChannel;

type SubscribeWithRetryOptions = {
  onSubscribed?: () => void;
  retryMs?: number;
};

/**
 * Subscribes a Realtime channel and silently recreates it after transient
 * failures. The factory must return a fresh, unsubscribed channel instance;
 * realtime-js throws when re-subscribing a channel that has already joined,
 * so we always remove the old channel and create a new one on retry.
 *
 * Retries run on a fixed interval (default 5 seconds) with no backoff — this
 * is a deliberate product requirement to keep reconnection behavior simple
 * and predictable. Retries pause while the app is backgrounded; the existing
 * runOnForeground / AppState paths are expected to reconnect on the next
 * foreground.
 */
export function subscribeWithRetry(
  createChannel: ChannelFactory,
  { onSubscribed, retryMs = 5_000 }: SubscribeWithRetryOptions = {},
): () => void {
  let current = createChannel();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const subscribe = (channel: RealtimeChannel) => {
    channel.subscribe((status) => {
      // Ignore callbacks from a channel we have already replaced or removed.
      if (channel !== current) return;

      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        onSubscribed?.();
        return;
      }

      if (
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
        || status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        || status === REALTIME_SUBSCRIBE_STATES.CLOSED
      ) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          // Do not reconnect while backgrounded; foreground handlers will
          // refresh state and this helper will resume retrying on the next
          // dropped channel.
          if (AppState.currentState !== 'active') return;
          if (channel !== current) return;
          void supabase.removeChannel(channel);
          const next = createChannel();
          current = next;
          subscribe(next);
        }, retryMs);
      }
    });
  };

  subscribe(current);

  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void supabase.removeChannel(current);
  };
}
