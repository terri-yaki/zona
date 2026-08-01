import { describe, expect, it } from 'vitest';

import { parseAccountUsage } from '../lib/account-usage';

describe('account usage response', () => {
  it('parses the canonical camel-case contract', () => {
    expect(parseAccountUsage({
      activeKeys: 3,
      alertsLast24Hours: 14,
      alertsLast7Days: 72,
      attachmentBytes: 2048,
      attachments: 5,
      phones: 2,
      retainedAlerts: 81,
      sources: 4,
    })).toEqual({
      activeKeys: 3,
      alertsLast24Hours: 14,
      alertsLast7Days: 72,
      attachmentBytes: 2048,
      attachments: 5,
      phones: 2,
      retainedAlerts: 81,
      sources: 4,
    });
  });

  it('accepts snake-case and nested count projections', () => {
    expect(parseAccountUsage({
      alerts: { retained: 9 },
      attachments: { bytes: 300, count: 2 },
      installations: 1,
      keys: { active: 2 },
      recent_alerts: { last_24_hours: 4, last_7_days: 8 },
      sources: 3,
    })).toMatchObject({
      activeKeys: 2,
      alertsLast24Hours: 4,
      alertsLast7Days: 8,
      attachmentBytes: 300,
      attachments: 2,
      phones: 1,
      retainedAlerts: 9,
      sources: 3,
    });
  });

  it('fails closed for a non-object and sanitizes invalid counts', () => {
    expect(() => parseAccountUsage(null)).toThrowError('INVALID_ACCOUNT_USAGE_RESPONSE');
    expect(parseAccountUsage({ activeKeys: -1, sources: '12' })).toMatchObject({ activeKeys: 0, sources: 0 });
  });
});
