import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountUsage } from '../data/account';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('expo-constants', () => ({ default: { expoConfig: null } }));
vi.mock('@/lib/installation', () => ({
  claimInstallationForUser: vi.fn(),
  getInstallationId: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

describe('account usage data access', () => {
  beforeEach(() => rpc.mockReset());

  it('calls the owner-scoped RPC and returns its typed usage', async () => {
    rpc.mockResolvedValue({
      data: {
        activeKeys: 1,
        alertsLast24Hours: 2,
        alertsLast7Days: 12_345,
        attachmentBytes: 5_242_880,
        attachments: 4,
        limits: { maxPushDevices: 5, maxSourceKeys: 3 },
        phones: 2,
        retainedAlerts: 15,
        sources: 3,
      },
      error: null,
    });

    await expect(getAccountUsage()).resolves.toMatchObject({
      alertsLast7Days: 12_345,
      limits: { maxPushDevices: 5, maxSourceKeys: 3 },
      phones: 2,
      sources: 3,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('get_account_usage');
  });

  it('propagates RPC failures so the Usage card can retry independently', async () => {
    const error = { code: 'PGRST001', message: 'network unavailable' };
    rpc.mockResolvedValue({ data: null, error });

    await expect(getAccountUsage()).rejects.toBe(error);
  });
});
