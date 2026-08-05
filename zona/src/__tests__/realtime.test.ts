import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppState } from 'react-native';
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js';

import { subscribeWithRetry } from '../lib/realtime';

// Transport boundary mock: channel instances are fakes created by the test's
// factory; removeChannel is observed through the supabase client mock.
const state = vi.hoisted(() => ({
  created: [] as {
    cb: ((status: string) => void) | null;
    subscribed: boolean;
  }[],
  removed: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    removeChannel: vi.fn(async (channel: unknown) => {
      state.removed.push(channel);
    }),
  },
}));

function createFakeChannel() {
  const channel = {
    cb: null as ((status: string) => void) | null,
    subscribed: false,
    subscribe(callback: (status: string) => void) {
      channel.cb = callback;
      channel.subscribed = true;
      return channel;
    },
  };
  state.created.push(channel);
  return channel;
}

function subscribe(options?: Parameters<typeof subscribeWithRetry>[1]) {
  return subscribeWithRetry(() => createFakeChannel() as unknown as RealtimeChannel, options);
}

function fire(index: number, status: string) {
  state.created[index].cb?.(status);
}

const appState = AppState as unknown as {
  __fire: (next: string) => void;
  __reset: () => void;
};

describe('subscribeWithRetry', () => {
  beforeEach(() => {
    state.created.length = 0;
    state.removed.length = 0;
    appState.__reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes the initial channel and reports the first SUBSCRIBED', () => {
    const onSubscribed = vi.fn();
    subscribe({ onSubscribed });

    expect(state.created).toHaveLength(1);
    expect(state.created[0].subscribed).toBe(true);

    fire(0, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(onSubscribed).toHaveBeenCalledTimes(1);
  });

  it('removes and recreates the channel after a failure once the retry delay elapses', () => {
    subscribe();

    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(4_999);
    expect(state.created).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(state.removed).toEqual([state.created[0]]);
    expect(state.created).toHaveLength(2);
    expect(state.created[1].subscribed).toBe(true);
  });

  it('cancels a pending retry when the channel resubscribes inside the retry window', () => {
    // realtime-js rejoins internally after transient errors; a recovered
    // healthy channel must not be torn down by its own stale retry timer.
    subscribe();

    fire(0, REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
    vi.advanceTimersByTime(2_000);
    fire(0, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    vi.advanceTimersByTime(60_000);

    expect(state.created).toHaveLength(1);
    expect(state.removed).toHaveLength(0);
  });

  it('ignores status callbacks from channels that were already replaced', () => {
    subscribe();

    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    expect(state.created).toHaveLength(2);

    // A late failure from the replaced channel must not schedule anything.
    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(120_000);
    expect(state.created).toHaveLength(2);
  });

  it('cleanup cancels pending retries and teardown CLOSED callbacks do not resurrect the channel', () => {
    const cleanup = subscribe();

    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    cleanup();
    expect(state.removed).toEqual([state.created[0]]);

    // removeChannel fires CLOSED on the removed channel; it must not pass
    // the guard and schedule a retry that recreates the channel.
    fire(0, REALTIME_SUBSCRIBE_STATES.CLOSED);
    vi.advanceTimersByTime(120_000);

    expect(state.created).toHaveLength(1);
    expect(state.removed).toHaveLength(1);
  });

  it('defers the retry while backgrounded and runs it on the next foreground transition', () => {
    subscribe();

    appState.__fire('background');
    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(30_000);
    expect(state.created).toHaveLength(1);
    expect(state.removed).toHaveLength(0);

    appState.__fire('active');
    expect(state.removed).toEqual([state.created[0]]);
    expect(state.created).toHaveLength(2);
    expect(state.created[1].subscribed).toBe(true);
  });

  it('drops the deferred retry when the channel recovers while backgrounded', () => {
    subscribe();

    appState.__fire('background');
    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);

    // Internal rejoin while backgrounded: the foreground transition must not
    // tear down the now-healthy channel.
    fire(0, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    appState.__fire('active');
    vi.advanceTimersByTime(120_000);

    expect(state.created).toHaveLength(1);
    expect(state.removed).toHaveLength(0);
  });

  it('clears the deferred foreground retry on cleanup', () => {
    const cleanup = subscribe();

    appState.__fire('background');
    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    cleanup();

    appState.__fire('active');
    vi.advanceTimersByTime(120_000);

    expect(state.created).toHaveLength(1);
    expect(state.removed).toEqual([state.created[0]]);
  });

  it('backs off exponentially on consecutive failures', () => {
    subscribe();

    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    expect(state.created).toHaveLength(2);

    fire(1, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    expect(state.created).toHaveLength(2);
    vi.advanceTimersByTime(5_000);
    expect(state.created).toHaveLength(3);

    fire(2, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(19_999);
    expect(state.created).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(state.created).toHaveLength(4);
  });

  it('resets the backoff after a successful resubscribe', () => {
    subscribe();

    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    fire(1, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);

    fire(1, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    expect(state.created).toHaveLength(3);
  });

  it('throttles onSubscribed so reconnect flapping cannot amplify into reload storms', () => {
    const onSubscribed = vi.fn();
    subscribe({ onSubscribed });

    fire(0, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(onSubscribed).toHaveBeenCalledTimes(1);

    fire(0, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    fire(1, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(onSubscribed).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    fire(1, REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    vi.advanceTimersByTime(5_000);
    fire(2, REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(onSubscribed).toHaveBeenCalledTimes(2);
  });
});
