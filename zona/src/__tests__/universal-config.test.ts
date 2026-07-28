import { describe, expect, it } from 'vitest';

import {
  FALLBACK_RETENTION_DAYS,
  FALLBACK_USER_GUIDE_URL,
  resolveUniversalConfig,
  type UniversalAppOptionRow,
} from '../lib/universal-config';

const rows: UniversalAppOptionRow[] = [
  { option_name: 'user_guide_url', value: 'https://docs.example.com/zona' },
  { option_name: 'retention_days_standard', value: '7' },
  { option_name: 'retention_days_premium', value: '30' },
];

describe('resolveUniversalConfig', () => {
  it('falls back to the shipped constants when the rows are unavailable', () => {
    for (const isPremium of [false, true]) {
      expect(resolveUniversalConfig(null, isPremium)).toEqual({
        userGuideUrl: FALLBACK_USER_GUIDE_URL,
        retentionDays: FALLBACK_RETENTION_DAYS,
      });
    }
  });

  it('uses the operator-configured guide URL from the backend rows', () => {
    expect(resolveUniversalConfig(rows, false).userGuideUrl).toBe('https://docs.example.com/zona');
  });

  it('resolves the retention window by server-reported tier', () => {
    expect(resolveUniversalConfig(rows, false).retentionDays).toBe(7);
    expect(resolveUniversalConfig(rows, true).retentionDays).toBe(30);
  });

  it('rejects non-positive retention values in favor of the fallback', () => {
    const broken: UniversalAppOptionRow[] = [
      { option_name: 'user_guide_url', value: 'https://docs.example.com/zona' },
      { option_name: 'retention_days_standard', value: '0' },
      { option_name: 'retention_days_premium', value: '-3' },
    ];
    expect(resolveUniversalConfig(broken, false).retentionDays).toBe(FALLBACK_RETENTION_DAYS);
    expect(resolveUniversalConfig(broken, true).retentionDays).toBe(FALLBACK_RETENTION_DAYS);
  });
});
