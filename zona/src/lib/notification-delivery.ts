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
