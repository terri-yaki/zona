export type NotificationDeliveryState = 'needs_attention' | 'not_sent' | 'queued' | 'sent';

export type NotificationDeliverySummary = {
  failed: number;
  pending: number;
  providerAccepted: number;
  reason: string | null;
  state: NotificationDeliveryState;
  targetedPhones: number;
  updatedAt: string | null;
};

const states = new Set<NotificationDeliveryState>(['needs_attention', 'not_sent', 'queued', 'sent']);

// Queued deliveries stop polling after this cap; a manual retry restarts the
// polling cycle instead of extending the original window.
export const DELIVERY_QUEUED_POLL_CAP_MS = 120_000;

export function deliveryQueuedPollExpired(
  firstPollAt: number | null,
  now: number,
  capMs = DELIVERY_QUEUED_POLL_CAP_MS,
) {
  return firstPollAt !== null && now - firstPollAt > capMs;
}

/** The delivery card stays hidden until there is a real summary or an error. */
export function deliveryCardVisible(summary: NotificationDeliverySummary | null, error: boolean) {
  return summary !== null || error;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseNotificationDeliverySummary(value: unknown): NotificationDeliverySummary {
  if (!record(value) || typeof value.state !== 'string' || !states.has(value.state as NotificationDeliveryState)) {
    throw new Error('INVALID_NOTIFICATION_DELIVERY_RESPONSE');
  }

  return {
    failed: count(value.failed),
    pending: count(value.pending),
    providerAccepted: count(value.providerAccepted ?? value.provider_accepted),
    reason: optionalString(value.reason),
    state: value.state as NotificationDeliveryState,
    targetedPhones: count(value.targetedPhones ?? value.targeted_phones),
    updatedAt: optionalString(value.updatedAt ?? value.updated_at),
  };
}
