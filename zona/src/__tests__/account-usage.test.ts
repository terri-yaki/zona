import { describe, expect, it } from 'vitest';

import { formatAccountUsageBytes, parseAccountUsage } from '../lib/account-usage';

const emptyLimits = {
  accountNotifyRpm: null,
  maxAccessKeysPerSource: null,
  maxAttachmentBytes: null,
  maxPushDevices: null,
  maxSourceKeys: null,
  retentionDays: null,
  sourceNotifyRpm: null,
};

describe('account usage response', () => {
  it('parses the canonical camel-case contract', () => {
    expect(parseAccountUsage({
      activeKeys: 3,
      alertsLast24Hours: 14,
      alertsLast7Days: 72,
      attachmentBytes: 2048,
      attachments: 5,
      limits: {
        accountNotifyRpm: 20,
        maxAccessKeysPerSource: 10,
        maxAttachmentBytes: 5_242_880,
        maxPushDevices: 5,
        maxSourceKeys: 3,
        retentionDays: 7,
        sourceNotifyRpm: 60,
      },
      phones: 2,
      retainedAlerts: 81,
      sources: 4,
    })).toEqual({
      activeKeys: 3,
      alertsLast24Hours: 14,
      alertsLast7Days: 72,
      attachmentBytes: 2048,
      attachments: 5,
      limits: {
        accountNotifyRpm: 20,
        maxAccessKeysPerSource: 10,
        maxAttachmentBytes: 5_242_880,
        maxPushDevices: 5,
        maxSourceKeys: 3,
        retentionDays: 7,
        sourceNotifyRpm: 60,
      },
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
      limits: { max_push_devices: 4, max_source_keys: 6 },
      recent_alerts: { last_24_hours: 4, last_7_days: 8 },
      sources: 3,
    })).toMatchObject({
      activeKeys: 2,
      alertsLast24Hours: 4,
      alertsLast7Days: 8,
      attachmentBytes: 300,
      attachments: 2,
      limits: { ...emptyLimits, maxPushDevices: 4, maxSourceKeys: 6 },
      phones: 1,
      retainedAlerts: 9,
      sources: 3,
    });
  });

  it('fails closed for a non-object and sanitizes invalid counts', () => {
    expect(() => parseAccountUsage(null)).toThrowError('INVALID_ACCOUNT_USAGE_RESPONSE');
    expect(parseAccountUsage({
      activeKeys: -1,
      limits: { maxPushDevices: 0, maxSourceKeys: '12' },
      sources: '12',
    })).toMatchObject({ activeKeys: 0, limits: emptyLimits, sources: 0 });
  });

  it('keeps zero values visible and formats large attachment totals', () => {
    expect(parseAccountUsage({})).toMatchObject({
      activeKeys: 0,
      alertsLast24Hours: 0,
      alertsLast7Days: 0,
      attachmentBytes: 0,
      attachments: 0,
      limits: emptyLimits,
      phones: 0,
      retainedAlerts: 0,
      sources: 0,
    });
    expect(formatAccountUsageBytes(0)).toBe('0 B');
    expect(formatAccountUsageBytes(1536)).toBe('1.5 KB');
    expect(formatAccountUsageBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB');
  });
});
