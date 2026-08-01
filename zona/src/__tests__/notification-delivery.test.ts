import { describe, expect, it } from 'vitest';

import { parseNotificationDeliverySummary } from '../lib/notification-delivery';

describe('notification delivery summary', () => {
  it('parses the canonical response', () => {
    expect(parseNotificationDeliverySummary({
      failed: 1,
      pending: 0,
      providerAccepted: 2,
      reason: null,
      state: 'sent',
      targetedPhones: 3,
      updatedAt: '2026-08-01T12:00:00Z',
    })).toEqual({
      failed: 1,
      pending: 0,
      providerAccepted: 2,
      reason: null,
      state: 'sent',
      targetedPhones: 3,
      updatedAt: '2026-08-01T12:00:00Z',
    });
  });

  it('accepts snake-case keys and sanitizes malformed counters', () => {
    expect(parseNotificationDeliverySummary({
      failed: -1,
      pending: '2',
      provider_accepted: 1,
      reason: '',
      state: 'queued',
      targeted_phones: 2,
      updated_at: null,
    })).toMatchObject({
      failed: 0,
      pending: 0,
      providerAccepted: 1,
      reason: null,
      targetedPhones: 2,
      updatedAt: null,
    });
  });

  it('rejects unknown states and non-objects', () => {
    expect(() => parseNotificationDeliverySummary(null)).toThrow('INVALID_NOTIFICATION_DELIVERY_RESPONSE');
    expect(() => parseNotificationDeliverySummary({ state: 'delivered' })).toThrow('INVALID_NOTIFICATION_DELIVERY_RESPONSE');
  });
});
