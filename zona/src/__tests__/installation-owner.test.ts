import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
const randomUuid = vi.hoisted(() => vi.fn());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storage.get(key) ?? null])),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      entries.forEach(([key, value]) => storage.set(key, value));
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

vi.mock('expo-crypto', () => ({ randomUUID: randomUuid }));

// Mocks must be registered before this stateful module is evaluated.
// eslint-disable-next-line import/first
import { claimInstallationForUser, getInstallationId } from '../lib/installation';

describe('installation ownership', () => {
  beforeEach(() => {
    storage.clear();
    randomUuid.mockReset();
    randomUuid.mockReturnValueOnce('installation-a').mockReturnValueOnce('installation-b');
  });

  it('keeps a legacy installation when its first owner is recorded', async () => {
    expect(await getInstallationId()).toBe('installation-a');
    expect(await claimInstallationForUser('user-a')).toBe('installation-a');
    expect(storage.get('zona.installation-owner')).toBe('user-a');
  });

  it('keeps the physical installation identity when the active account changes', async () => {
    expect(await claimInstallationForUser('user-a')).toBe('installation-a');
    expect(await claimInstallationForUser('user-b')).toBe('installation-a');
    expect(storage.get('zona.installation-id')).toBe('installation-a');
    expect(storage.get('zona.installation-owner')).toBe('user-b');
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it('reuses the installation for later sessions of the same account', async () => {
    expect(await claimInstallationForUser('user-a')).toBe('installation-a');
    expect(await claimInstallationForUser('user-a')).toBe('installation-a');
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });
});
