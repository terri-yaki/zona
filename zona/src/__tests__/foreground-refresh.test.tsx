import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'react-test-renderer';

import { writeCache } from '../cache/store';
import { useInbox } from '../hooks/useInbox';
import { useSources } from '../hooks/useSources';

// Storage boundary mock (same in-memory pattern as offline-cache.test.ts).
const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => [...storage.keys()]),
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storage.get(key) ?? null] as [string, string | null])),
    multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); }),
    multiSet: vi.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => storage.set(key, value)); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

// Transport boundary mock: supabase rpc (inbox snapshot) + query chain (sources).
const server = vi.hoisted(() => ({
  inboxCalls: 0,
  inboxSnapshot: { rows: [] as unknown[], unreadCount: 0 },
  sourcesCalls: 0,
  sourcesRows: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (name: string) => {
      if (name === 'get_inbox_snapshot') {
        server.inboxCalls += 1;
        return Promise.resolve({ data: server.inboxSnapshot, error: null });
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
        return Promise.resolve({ data: server.sourcesRows, error: null }).then(resolve, reject);
      };
      return chain;
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: async () => undefined,
  },
}));

// Focus effects are navigation-driven, not app-state-driven: no-op them so the
// foreground wiring under test is the only fetch trigger.
vi.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
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
const inboxFilters = { sourceId: null, since: null, unreadOnly: false };

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

let inboxState: ReturnType<typeof useInbox> | null = null;
function InboxProbe({ widgetEnabled = true }: { widgetEnabled?: boolean }) {
  const state = useInbox(userId, inboxFilters, 30, widgetEnabled);
  useEffect(() => {
    inboxState = state;
  });
  return null;
}

let sourcesState: ReturnType<typeof useSources> | null = null;
function SourcesProbe() {
  const state = useSources();
  useEffect(() => {
    sourcesState = state;
  });
  return null;
}

describe('foreground re-sync (network-first on open and resume)', () => {
  beforeEach(() => {
    storage.clear();
    server.inboxCalls = 0;
    server.sourcesCalls = 0;
    server.inboxSnapshot = { rows: [], unreadCount: 0 };
    server.sourcesRows = [];
    inboxState = null;
    sourcesState = null;
    widgetSync.mockClear();
    (AppState as unknown as { __reset: () => void }).__reset();
  });

  it('inbox: fresh disk cache on cold start still fetches, and server rows win', async () => {
    await writeCache(userId, 'inbox', 'all|all|anytime|30', {
      cursor: null,
      hasMore: false,
      items: [{ ...inboxRow('cached-1', 'Cached alert'), data: {} }],
      unreadCount: 1,
    });
    server.inboxSnapshot = { rows: [inboxRow('server-1', 'Fresh server alert')], unreadCount: 2 };

    await act(async () => {
      create(<InboxProbe />);
    });
    await flush();

    expect(server.inboxCalls).toBeGreaterThanOrEqual(1);
    expect(inboxState!.items.map((item) => item.id)).toEqual(['server-1']);
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
    act(() => {
      (AppState as unknown as { __fire: (state: string) => void }).__fire('background');
      (AppState as unknown as { __fire: (state: string) => void }).__fire('active');
    });
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
    act(() => {
      (AppState as unknown as { __fire: (state: string) => void }).__fire('background');
      (AppState as unknown as { __fire: (state: string) => void }).__fire('active');
    });
    await flush();

    expect(server.sourcesCalls).toBeGreaterThan(callsBeforeResume);
    expect(sourcesState!.sources.map((source) => source.id)).toEqual(['source-v2']);
  });
});
