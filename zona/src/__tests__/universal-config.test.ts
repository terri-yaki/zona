import { describe, expect, it } from 'vitest';

import {
  FALLBACK_RETENTION_DAYS,
  FALLBACK_USER_GUIDE_URL,
  resolveUniversalConfig,
} from '../lib/universal-config';

const row = {
  user_guide_url: 'https://docs.example.com/zona',
  retention_days_standard: 7,
  retention_days_premium: 30,
};

describe('resolveUniversalConfig', () => {
  it('falls back to the shipped constants when the row is unavailable', () => {
    for (const isPremium of [false, true]) {
      expect(resolveUniversalConfig(null, isPremium)).toEqual({
        userGuideUrl: FALLBACK_USER_GUIDE_URL,
        retentionDays: FALLBACK_RETENTION_DAYS,
      });
    }
  });

  it('uses the operator-configured guide URL from the backend row', () => {
    expect(resolveUniversalConfig(row, false).userGuideUrl).toBe('https://docs.example.com/zona');
  });

  it('resolves the retention window by server-reported tier', () => {
    expect(resolveUniversalConfig(row, false).retentionDays).toBe(7);
    expect(resolveUniversalConfig(row, true).retentionDays).toBe(30);
  });

  it('rejects non-positive retention values in favor of the fallback', () => {
    expect(resolveUniversalConfig({ ...row, retention_days_standard: 0 }, false).retentionDays)
      .toBe(FALLBACK_RETENTION_DAYS);
    expect(resolveUniversalConfig({ ...row, retention_days_premium: -3 }, true).retentionDays)
      .toBe(FALLBACK_RETENTION_DAYS);
  });
});
