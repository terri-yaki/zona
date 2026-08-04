import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import { getNotificationDeliverySummary, listNotifications } from '../data/notifications';
import { getAccountUsage } from '../data/account';
import { getSourceHealth } from '../data/source-health';

/**
 * Regression: SupabaseClient.rpc reads `this.rest`. Extracting
 * `const rpc = client.rpc` and calling `rpc(...)` drops the receiver and
 * throws "Cannot read properties of undefined (reading 'rest')".
 * Production helpers must call `supabase.rpc(...)` as a method.
 */

const restRpc = vi.hoisted(() => vi.fn());

const rpcSpy = vi.hoisted(() =>
  vi.fn(function (this: { rest: { rpc: typeof restRpc } }, name: string, args?: Record<string, unknown>) {
    if (this == null || this.rest == null) {
      throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    }
    return this.rest.rpc(name, args);
  }),
);

vi.mock('expo-constants', () => ({ default: { expoConfig: null } }));
vi.mock('@/lib/installation', () => ({
  claimInstallationForUser: vi.fn(),
  getInstallationId: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rest: { rpc: restRpc },
    rpc: rpcSpy,
    from: () => {
      throw new Error('table fallback should not run when inbox RPC succeeds');
    },
  },
}));

describe('Supabase rpc receiver binding', () => {
  beforeEach(() => {
    rpcSpy.mockClear();
    restRpc.mockReset();
  });

  it('real createClient: unbound rpc extraction throws reading rest; method call does not', async () => {
    const client = createClient('https://example.supabase.co', 'public-anon-key');
    const clientRest = (client as unknown as { rest: { rpc: (...args: unknown[]) => unknown } }).rest;
    const transport = vi.spyOn(clientRest, 'rpc').mockReturnValue(
      Promise.resolve({ data: null, error: null }),
    );

    const unbound = client.rpc as unknown as (name: string, args?: Record<string, unknown>) => unknown;
    let unboundError: unknown;
    try {
      unbound('get_inbox_page_v2', {});
    } catch (error) {
      unboundError = error;
    }
    expect(unboundError).toBeInstanceOf(TypeError);
    expect(String(unboundError)).toMatch(/rest/i);

    await expect(client.rpc('get_inbox_page_v2' as never, {} as never)).resolves.toEqual({
      data: null,
      error: null,
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.slice(0, 2)).toEqual(['get_inbox_page_v2', {}]);
  });

  it('listNotifications invokes get_inbox_page_v2 with a bound client receiver', async () => {
    const row = {
      id: 'n1',
      user_id: 'u1',
      source_id: 's1',
      source_name_snapshot: 'PC',
      title: 'Hello',
      body: 'World',
      category: null,
      severity: null,
      data: {},
      created_at: '2026-08-01T00:00:00.000Z',
      read_at: null,
      expires_at: '2026-08-08T00:00:00.000Z',
      attachment_path: null,
      attachment_mime: null,
      attachment_bytes: null,
      pinned_at: null,
      push_suppressed_reason: null,
    };
    restRpc.mockImplementation((name: string) => {
      if (name === 'get_inbox_page_v2') {
        return Promise.resolve({ data: { rows: [row], hasMore: false, unreadCount: 1 }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
    });

    const page = await listNotifications({ sourceId: null, since: null, unreadOnly: false });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('Hello');
    expect(rpcSpy).toHaveBeenCalled();
    const firstCall = rpcSpy.mock.calls[0];
    expect(firstCall?.[0]).toBe('get_inbox_page_v2');
    // Bound method: Vitest records `this` as the mock client with `.rest`.
    const thisArg = rpcSpy.mock.contexts[0] as { rest?: unknown } | undefined;
    expect(thisArg?.rest).toBeDefined();
  });

  it('account and source-health RPCs require a bound receiver', async () => {
    restRpc.mockImplementation((name: string) => {
      if (name === 'get_account_usage') {
        return Promise.resolve({
          data: {
            activeKeys: 0,
            alertsLast24Hours: 0,
            alertsLast7Days: 0,
            attachmentBytes: 0,
            attachments: 0,
            limits: { maxPushDevices: 5, maxSourceKeys: 3 },
            phones: 1,
            retainedAlerts: 0,
            sources: 0,
          },
          error: null,
        });
      }
      if (name === 'get_source_health') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
    });

    await expect(getAccountUsage()).resolves.toMatchObject({ phones: 1, sources: 0 });
    await expect(getSourceHealth()).resolves.toEqual([]);

    for (const context of rpcSpy.mock.contexts) {
      expect((context as { rest?: unknown } | undefined)?.rest).toBeDefined();
    }
  });

  it('getNotificationDeliverySummary uses a bound rpc call', async () => {
    restRpc.mockResolvedValue({
      data: {
        state: 'queued',
        failed: 0,
        pending: 1,
        providerAccepted: 0,
        reason: null,
        targetedPhones: 1,
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });

    const summary = await getNotificationDeliverySummary('n1');
    expect(summary).toMatchObject({ state: 'queued', pending: 1, targetedPhones: 1 });
    expect(rpcSpy.mock.contexts[0]).toMatchObject({ rest: expect.anything() });
  });
});
