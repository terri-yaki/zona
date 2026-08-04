import { describe, expect, it, vi } from 'vitest';

import { resolveDeviceTimeZone } from '../lib/device-timezone';

vi.mock('expo-localization', () => ({ getCalendars: () => [] }));

describe('resolveDeviceTimeZone', () => {
  it('uses the phone calendar time zone first', () => {
    expect(resolveDeviceTimeZone('Asia/Hong_Kong', 'UTC')).toBe('Asia/Hong_Kong');
  });

  it('falls back to the runtime time zone and then UTC', () => {
    expect(resolveDeviceTimeZone(null, 'America/New_York')).toBe('America/New_York');
    expect(resolveDeviceTimeZone(' ', '')).toBe('UTC');
  });
});
