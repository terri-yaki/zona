import { describe, expect, it } from 'vitest';

import {
  DELIVERY_QUEUED_POLL_CAP_MS,
  deliveryCardVisible,
  deliveryQueuedPollExpired,
  parseNotificationDeliverySummary,
} from '../lib/notification-delivery';

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

describe('queued delivery polling cap', () => {
  it('stops polling once the window since the first poll exceeds the cap', () => {
    const firstPollAt = 1_000_000;
    expect(deliveryQueuedPollExpired(firstPollAt, firstPollAt)).toBe(false);
    expect(deliveryQueuedPollExpired(firstPollAt, firstPollAt + DELIVERY_QUEUED_POLL_CAP_MS)).toBe(false);
    expect(deliveryQueuedPollExpired(firstPollAt, firstPollAt + DELIVERY_QUEUED_POLL_CAP_MS + 1)).toBe(true);
  });

  it('keeps polling when no first poll was recorded', () => {
    expect(deliveryQueuedPollExpired(null, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('delivery card visibility', () => {
  const summary = {
    failed: 0,
    pending: 1,
    providerAccepted: 0,
    reason: null,
    state: 'queued' as const,
    targetedPhones: 1,
    updatedAt: null,
  };

  it('renders nothing until a real summary or an error exists', () => {
    expect(deliveryCardVisible(null, false)).toBe(false);
    expect(deliveryCardVisible(null, true)).toBe(true);
    expect(deliveryCardVisible(summary, false)).toBe(true);
    expect(deliveryCardVisible(summary, true)).toBe(true);
  });
});
