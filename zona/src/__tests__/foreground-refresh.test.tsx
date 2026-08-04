import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'react-test-renderer';

import { clearCachedContent } from '../cache/session';
import { writeCache } from '../cache/store';
import type { InboxFilters } from '../data/notifications';
import { useInbox } from '../hooks/useInbox';
import { useSources } from '../hooks/useSources';
import { translate } from '../i18n';
import { FOREGROUND_REFRESH_TIMEOUT_MS } from '../lib/timeout';

// Storage boundary mock (same in-memory pattern as offline-cache.test.ts).
const storage = vi.hoisted(() => new Map<string, string>());

// Transport boundary mock: supabase rpc (inbox snapshot/page) + query chain (sources).
const server = vi.hoisted(() => ({
  hangInbox: false,
  hangSources: false,
  hangStorage: false,
  inboxCalls: 0,
  inboxOverrides: [] as Promise<unknown>[],
  inboxPage: null as null | { rows: unknown[]; hasMore: boolean; unreadCount: number },
  inboxSnapshot: { rows: [] as unknown[], unreadCount: 0 },
  markAllCalls: 0,
  sourcesCalls: 0,
  sourcesOverrides: [] as Promise<unknown>[],
  sourcesRows: [] as unknown[],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => [...storage.keys()]),
    getItem: vi.fn(async (key: string) => {
      if (server.hangStorage) await new Promise(() => undefined);
      return storage.get(key) ?? null;
    }),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storage.get(key) ?? null] as [string, string | null])),
    multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); }),
    multiSet: vi.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => storage.set(key, value)); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (name: string) => {
      if (name === 'get_inbox_page_v2' || name === 'get_inbox_snapshot') {
        server.inboxCalls += 1;
        if (server.hangInbox) return new Promise(() => undefined);
        if (server.inboxOverrides.length) return server.inboxOverrides.shift();
        if (name === 'get_inbox_page_v2') {
          if (server.inboxPage) return Promise.resolve({ data: server.inboxPage, error: null });
          // Reported as "not deployed yet" so the data layer falls back to the snapshot RPC.
          return Promise.resolve({ data: null, error: { code: '42883', message: 'get_inbox_page_v2 missing from schema cache' } });
        }
        return Promise.resolve({ data: server.inboxSnapshot, error: null });
      }
      if (name === 'mark_all_inbox_notifications_read') {
        server.markAllCalls += 1;
        if (server.hangInbox) return new Promise(() => undefined);
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'order', 'eq', 'is', 'gte', 'or', 'limit']) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        server.sourcesCalls += 1;
        if (server.hangSources) return new Promise(() => undefined);
        const next = server.sourcesOverrides.length
          ? server.sourcesOverrides.shift()!
          : Promise.resolve({ data: server.sourcesRows, error: null });
        return next.then(resolve, reject);
      };
      return chain;
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: async () => undefined,
  },
}));

// Focus effects are navigation-driven, not app-state-driven: capture the
// latest callback so tests can fire it explicitly instead of it racing the
// foreground wiring under test.
const focus = vi.hoisted(() => ({ callback: null as null | (() => unknown) }));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => unknown) => {
    focus.callback = callback;
  },
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-foreground' } } }),
}));

vi.mock('@/lib/android-source-notifications', () => ({
  syncAndroidSourceNotificationChannels: async () => undefined,
}));

const widgetSync = vi.hoisted(() => vi.fn());
vi.mock('@/lib/inbox-widget', () => ({ syncInboxWidget: widgetSync }));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const userId = 'user-foreground';
const inboxFilters: InboxFilters = { sourceId: null, since: null, unreadOnly: false };
// Must match filterCacheVariant() in useInbox for the default filters above.
const inboxCacheVariant = 'v2|all|all|anytime|all-pins|all-severity||30';

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function inboxRow(id: string, title: string) {
  return {
    id,
    user_id: userId,
    source_id: 'source-1',
    source_name_snapshot: 'Home PC',
    title,
    body: 'body',
    category: null,
    severity: null,
    data: {},
    created_at: '2026-08-01T04:00:00+00:00',
    read_at: null,
    expires_at: '2026-08-08T04:00:00+00:00',
    attachment_path: null,
    attachment_mime: null,
    attachment_bytes: null,
  };
}

function sourceOverviewRow(id: string, name: string) {
  return {
    id,
    user_id: userId,
    display_name: name,
    hostname: 'home-pc',
    created_at: '2026-07-20T00:00:00+00:00',
    last_seen_at: '2026-08-01T04:00:00+00:00',
    revoked_at: null,
    access_key_id: `key-${id}`,
    access_key_name: name,
    key_prefix: 'zona_live_test',
    is_active: true,
    access_key_created_at: '2026-07-20T00:00:00+00:00',
    access_key_updated_at: '2026-07-20T00:00:00+00:00',
    access_key_last_used_at: null,
    access_key_expires_at: null,
    access_key_revoked_at: null,
    sound_name: null,
  };
}

async function flush(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// Microtask-only flush for fake-timer tests (flush() would hang on its own
// setTimeout while timers are mocked).
async function flushMicrotasks(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

function resumeApp() {
  act(() => {
    (AppState as unknown as { __fire: (state: string) => void }).__fire('background');
    (AppState as unknown as { __fire: (state: string) => void }).__fire('active');
  });
}

let inboxState: ReturnType<typeof useInbox> | null = null;
function InboxProbe({ filters = inboxFilters, widgetEnabled = true }: {
  filters?: InboxFilters;
  widgetEnabled?: boolean;
}) {
  const state = useInbox(userId, filters, 30, widgetEnabled);
  useEffect(() => {
    inboxState = state;
  });
  return null;
}

let sourcesState: ReturnType<typeof useSources> | null = null;
function SourcesProbe({ includeRevoked = true }: { includeRevoked?: boolean }) {
  const state = useSources(includeRevoked);
  useEffect(() => {
    sourcesState = state;
  });
  return null;
}

describe('foreground re-sync (network-first on open and resume)', () => {
  beforeEach(async () => {
    storage.clear();
    await clearCachedContent(userId);
    server.hangInbox = false;
    server.hangSources = false;
    server.hangStorage = false;
    server.inboxCalls = 0;
    server.inboxOverrides = [];
    server.inboxPage = null;
    server.inboxSnapshot = { rows: [], unreadCount: 0 };
    server.markAllCalls = 0;
    server.sourcesCalls = 0;
    server.sourcesOverrides = [];
    server.sourcesRows = [];
    focus.callback = null;
    inboxState = null;
    sourcesState = null;
    widgetSync.mockClear();
    (AppState as unknown as { __reset: () => void }).__reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inbox: fresh disk cache paints first on cold start, then the server wins', async () => {
    await writeCache(userId, 'inbox', inboxCacheVariant, {
      cursor: null,
      hasMore: false,
      items: [{ ...inboxRow('cached-1', 'Cached alert'), data: {} }],
      unreadCount: 1,
    });
    const gate = deferred();
    server.inboxOverrides = [gate.promise];

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();

    // The disk cache paints before the network answers.
    expect(inboxState!.items.map((item) => item.id)).toEqual(['cached-1']);
    expect(inboxState!.unreadCount).toBe(1);

    gate.resolve({ data: { rows: [inboxRow('server-1', 'Fresh server alert')], hasMore: false, unreadCount: 2 }, error: null });
    await flush();

    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-1']);
    expect(inboxState!.unreadCount).toBe(2);
  });

  it('inbox: overlapping focus and foreground triggers issue a single fetch', async () => {
    const gate = deferred();
    server.inboxOverrides = [gate.promise];

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();
    expect(inboxState!.refreshing).toBe(true);
    expect(server.inboxCalls).toBe(1);

    // The focus effect fires while the foreground refresh is still in flight:
    // it must join the in-flight load instead of issuing a duplicate fetch.
    act(() => {
      focus.callback?.();
    });
    await flush();
    expect(server.inboxCalls).toBe(1);

    gate.resolve({ data: { rows: [inboxRow('server-1', 'Settled')], hasMore: false, unreadCount: 1 }, error: null });
    await flush();

    expect(inboxState!.refreshing).toBe(false);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-1']);
    expect(server.inboxCalls).toBe(1);
  });

  it('inbox: a resume during an in-flight refresh coalesces instead of double-fetching', async () => {
    const first = deferred();
    server.inboxOverrides = [first.promise];

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();
    first.resolve({ data: { rows: [inboxRow('server-1', 'First fetch')], hasMore: false, unreadCount: 1 }, error: null });
    await flush();
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-1']);

    const second = deferred();
    server.inboxOverrides = [second.promise];
    resumeApp();
    expect(inboxState!.refreshing).toBe(true);
    const callsDuringRefresh = server.inboxCalls;

    // A second resume while the refresh is still in flight joins it.
    resumeApp();
    expect(server.inboxCalls).toBe(callsDuringRefresh);

    second.resolve({ data: { rows: [inboxRow('server-2', 'After resume')], hasMore: false, unreadCount: 2 }, error: null });
    await flush();

    expect(inboxState!.refreshing).toBe(false);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-2']);
    expect(inboxState!.unreadCount).toBe(2);
  });

  it('inbox: returning to the foreground fetches again and applies newer server rows', async () => {
    server.inboxSnapshot = { rows: [inboxRow('server-1', 'First fetch')], unreadCount: 1 };
    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-1']);

    server.inboxSnapshot = { rows: [inboxRow('server-2', 'After resume')], unreadCount: 5 };
    const callsBeforeResume = server.inboxCalls;
    resumeApp();
    await flush();

    expect(server.inboxCalls).toBeGreaterThan(callsBeforeResume);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-2']);
    expect(inboxState!.unreadCount).toBe(5);
  });

  it('inbox: does not write widget snapshots when its runtime control is off', async () => {
    server.inboxSnapshot = { rows: [inboxRow('server-1', 'Widget stays quiet')], unreadCount: 1 };
    await act(async () => {
      create(<InboxProbe widgetEnabled={false} />);
    });
    await flush();

    expect(widgetSync).not.toHaveBeenCalled();
  });

  it('sources: fresh cache on cold start still fetches, and resume fetches again', async () => {
    await writeCache(userId, 'sources', 'with-revoked', [
      { id: 'cached-source', user_id: userId, display_name: 'Cached PC', hostname: 'cached', created_at: '2026-07-20T00:00:00+00:00', last_seen_at: null, revoked_at: null, api_key: null },
    ]);
    server.sourcesRows = [sourceOverviewRow('source-v1', 'Server PC')];

    await act(async () => {
      create(<SourcesProbe />);
    });
    await flush();

    expect(server.sourcesCalls).toBeGreaterThanOrEqual(1);
    expect(sourcesState!.sources.map((source) => source.id)).toEqual(['source-v1']);

    server.sourcesRows = [sourceOverviewRow('source-v2', 'Server PC renamed')];
    const callsBeforeResume = server.sourcesCalls;
    resumeApp();
    await flush();

    expect(server.sourcesCalls).toBeGreaterThan(callsBeforeResume);
    expect(sourcesState!.sources.map((source) => source.id)).toEqual(['source-v2']);
  });

  it('sources: overlapping focus and foreground triggers issue a single fetch', async () => {
    const gate = deferred();
    server.sourcesOverrides = [gate.promise];

    await act(async () => {
      create(<SourcesProbe />);
    });
    await flush();
    expect(sourcesState!.refreshing).toBe(true);
    expect(server.sourcesCalls).toBe(1);

    // The focus effect fires while the foreground load is still in flight: it
    // must join the in-flight load instead of issuing a duplicate fetch.
    act(() => {
      focus.callback?.();
    });
    await flush();
    expect(server.sourcesCalls).toBe(1);

    gate.resolve({ data: [sourceOverviewRow('source-1', 'Server PC')], error: null });
    await flush();

    expect(sourcesState!.refreshing).toBe(false);
    expect(sourcesState!.sources.map((source) => source.id)).toEqual(['source-1']);
    expect(server.sourcesCalls).toBe(1);
  });

  it('inbox: refreshing and bootstrapping clear after a hung cold-open load', async () => {
    vi.useFakeTimers();
    server.hangInbox = true;

    await act(async () => {
      create(<InboxProbe />);
    });
    expect(inboxState!.refreshing).toBe(true);
    expect(inboxState!.bootstrapping).toBe(true);

    // Halfway through the timeout both spinners must still be up: they clear
    // because the timeout fires, not because something settled early.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS / 2);
    });
    expect(inboxState!.refreshing).toBe(true);
    expect(inboxState!.bootstrapping).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(inboxState!.refreshing).toBe(false);
    expect(inboxState!.bootstrapping).toBe(false);
    expect(inboxState!.error?.message).toBe(translate('error.connection'));
  });

  it('inbox: refreshing clears after a hung AppState resume load', async () => {
    vi.useFakeTimers();
    server.hangInbox = true;

    await act(async () => {
      create(<InboxProbe />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });
    expect(inboxState!.refreshing).toBe(false);

    resumeApp();
    expect(inboxState!.refreshing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(inboxState!.refreshing).toBe(false);
  });

  it('inbox: a hung disk-cache read does not strand the cold-open spinners', async () => {
    vi.useFakeTimers();
    server.hangStorage = true;
    server.inboxSnapshot = { rows: [inboxRow('server-1', 'After storage hang')], unreadCount: 1 };

    await act(async () => {
      create(<InboxProbe />);
    });
    expect(inboxState!.refreshing).toBe(true);
    expect(inboxState!.bootstrapping).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(inboxState!.refreshing).toBe(false);
    expect(inboxState!.bootstrapping).toBe(false);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-1']);
  });

  it('inbox: loadingMore clears after a hung load-more fetch', async () => {
    server.inboxPage = { rows: [inboxRow('page-1', 'First page')], hasMore: true, unreadCount: 1 };

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();
    expect(inboxState!.hasMore).toBe(true);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['page-1']);

    vi.useFakeTimers();
    server.hangInbox = true;
    act(() => {
      void inboxState!.loadMore();
    });
    expect(inboxState!.loadingMore).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(inboxState!.loadingMore).toBe(false);
    expect(inboxState!.error?.message).toBe(translate('error.connection'));
  });

  it('inbox: a load-more during an in-flight refresh clears both spinners independently', async () => {
    server.inboxPage = { rows: [inboxRow('page-1', 'First page')], hasMore: true, unreadCount: 1 };

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();
    expect(inboxState!.items.map((item) => item.id)).toEqual(['page-1']);

    const refreshGate = deferred();
    const loadMoreGate = deferred();
    server.inboxOverrides = [refreshGate.promise, loadMoreGate.promise];
    resumeApp();
    expect(inboxState!.refreshing).toBe(true);

    // loadMore shares the generation counter with load: it supersedes the
    // in-flight refresh's result guards.
    act(() => {
      void inboxState!.loadMore();
    });
    expect(inboxState!.loadingMore).toBe(true);

    // The superseded refresh settles: refreshing clears via the load-only
    // generation counter without touching loadingMore.
    refreshGate.resolve({ data: { rows: [inboxRow('page-2', 'Refresh page')], hasMore: true, unreadCount: 2 }, error: null });
    await flush();
    expect(inboxState!.refreshing).toBe(false);
    expect(inboxState!.loadingMore).toBe(true);

    loadMoreGate.resolve({
      data: { rows: [inboxRow('page-1', 'First page'), inboxRow('page-0', 'Older page')], hasMore: false, unreadCount: 2 },
      error: null,
    });
    await flush();
    expect(inboxState!.loadingMore).toBe(false);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['page-1', 'page-0']);
  });

  it('inbox: a mid-flight filter change strands no spinners when the stale load settles', async () => {
    const staleGate = deferred();
    server.inboxOverrides = [staleGate.promise];
    let probe: ReturnType<typeof create> | null = null;
    await act(async () => {
      probe = create(<InboxProbe />);
    });
    await flush();
    expect(inboxState!.refreshing).toBe(true);

    await act(async () => {
      probe!.update(<InboxProbe filters={{ ...inboxFilters, unreadOnly: true }} />);
    });
    await flush();
    expect(inboxState!.bootstrapping).toBe(true);

    const freshGate = deferred();
    server.inboxOverrides = [freshGate.promise];
    act(() => {
      void inboxState!.retry();
    });
    await flush();
    expect(inboxState!.bootstrapping).toBe(true);

    // The stale load settles while the new cache key's load is in flight: it
    // must not apply its rows or clear the new key's spinner.
    staleGate.resolve({ data: { rows: [inboxRow('stale-1', 'Stale')], hasMore: false, unreadCount: 9 }, error: null });
    await flush();
    expect(inboxState!.bootstrapping).toBe(true);
    expect(inboxState!.items).toEqual([]);

    freshGate.resolve({ data: { rows: [inboxRow('unread-1', 'Unread')], hasMore: false, unreadCount: 1 }, error: null });
    await flush();
    expect(inboxState!.bootstrapping).toBe(false);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['unread-1']);
    expect(inboxState!.unreadCount).toBe(1);
  });

  it('inbox: markingAllRead clears after a hung mark-all fetch', async () => {
    server.inboxSnapshot = { rows: [inboxRow('n-1', 'One'), inboxRow('n-2', 'Two')], unreadCount: 2 };

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();
    expect(inboxState!.unreadCount).toBe(2);

    vi.useFakeTimers();
    server.hangInbox = true;
    act(() => {
      void inboxState!.markAllRead();
    });
    expect(inboxState!.markingAllRead).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(inboxState!.markingAllRead).toBe(false);
    expect(inboxState!.error?.message).toBe(translate('error.connection'));
  });

  it('sources: loading and refreshing clear after a hung cold-open load', async () => {
    vi.useFakeTimers();
    server.hangSources = true;

    await act(async () => {
      create(<SourcesProbe />);
    });
    // Hydration finishes fast (disk miss); refreshing alone proves the hung
    // network load is what keeps the spinner up.
    expect(sourcesState!.refreshing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS / 2);
    });
    expect(sourcesState!.refreshing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(sourcesState!.loading).toBe(false);
    expect(sourcesState!.refreshing).toBe(false);
    expect(sourcesState!.error?.message).toBe(translate('error.connection'));
  });

  it('sources: a hung disk-cache read does not strand loading', async () => {
    vi.useFakeTimers();
    server.hangStorage = true;
    const gate = deferred();
    server.sourcesOverrides = [gate.promise];

    await act(async () => {
      create(<SourcesProbe />);
    });
    await flushMicrotasks();
    // Hydration is stuck on the disk read; the network load is gated.
    expect(sourcesState!.loading).toBe(true);
    expect(sourcesState!.refreshing).toBe(true);

    // The hydration disk read times out (and so does the gated network load):
    // both spinners must clear without any follow-up focus load.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });
    expect(sourcesState!.loading).toBe(false);
    expect(sourcesState!.refreshing).toBe(false);
    expect(sourcesState!.error?.message).toBe(translate('error.connection'));
  });

  it('sources: a stale in-flight load cannot clear the next cache key’s hydration spinner', async () => {
    vi.useFakeTimers();
    const staleGate = deferred();
    server.sourcesOverrides = [staleGate.promise];
    let probe: ReturnType<typeof create> | null = null;
    await act(async () => {
      probe = create(<SourcesProbe includeRevoked />);
    });
    await flushMicrotasks();
    expect(sourcesState!.refreshing).toBe(true);

    // Switching includeRevoked changes the cache key; hydration for the new
    // key hangs on the disk read while the old key's load is still in flight.
    server.hangStorage = true;
    await act(async () => {
      probe!.update(<SourcesProbe includeRevoked={false} />);
    });
    await flushMicrotasks();
    expect(sourcesState!.loading).toBe(true);

    // The stale load settles: guarded by the cache key, it must not apply its
    // rows or clear the new key's loading/refreshing state.
    staleGate.resolve({ data: [sourceOverviewRow('stale-source', 'Stale PC')], error: null });
    await flushMicrotasks();
    expect(sourcesState!.loading).toBe(true);
    expect(sourcesState!.refreshing).toBe(true);
    expect(sourcesState!.sources).toEqual([]);

    // The hydration timeout fires: loading clears even without a follow-up load.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });
    expect(sourcesState!.loading).toBe(false);

    // The follow-up focus load (which production fires once hydration lands)
    // takes over and settles the remaining spinner.
    act(() => {
      focus.callback?.();
    });
    await flushMicrotasks();
    expect(sourcesState!.refreshing).toBe(false);
  });

  it('sources: refreshing clears after a hung AppState resume load', async () => {
    vi.useFakeTimers();
    server.hangSources = true;

    await act(async () => {
      create(<SourcesProbe />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });
    expect(sourcesState!.refreshing).toBe(false);

    resumeApp();
    expect(sourcesState!.refreshing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    });

    expect(sourcesState!.refreshing).toBe(false);
  });
});
