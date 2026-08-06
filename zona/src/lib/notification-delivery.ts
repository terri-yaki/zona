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
// polling cycle instead of extending the original window. The same window
// decides when a stuck "On its way" card is no longer useful to show.
export const DELIVERY_QUEUED_POLL_CAP_MS = 120_000;

export function deliveryQueuedPollExpired(
  firstPollAt: number | null,
  now: number,
  capMs = DELIVERY_QUEUED_POLL_CAP_MS,
) {
  return firstPollAt !== null && now - firstPollAt > capMs;
}

export type DeliveryCardVisibilityOptions = {
  /** Epoch ms used for age checks. Defaults to Date.now(). */
  now?: number;
  /**
   * Notification created_at (ISO). Used so an old alert never keeps the
   * "On its way" card after the handoff window has closed.
   */
  notificationCreatedAt?: string | null;
};

function ageMs(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? now - parsed : null;
}

/**
 * Delivery status only speaks up for real news:
 * - fetch/error surfaces stay visible so the owner can retry
 * - needs_attention (failed handoff) always shows
 * - quiet-hours / suppressed not_sent with a reason shows (why no push)
 * - queued only while the alert is still young and work remains pending
 * - plain not_sent and successful sent stay silent (inbox already has the alert)
 */
export function deliveryCardVisible(
  summary: NotificationDeliverySummary | null,
  error: boolean,
  options: DeliveryCardVisibilityOptions = {},
) {
  if (error) return true;
  if (!summary) return false;

  if (summary.state === 'needs_attention') return true;

  if (summary.state === 'not_sent') {
    // Only a concrete suppress reason is useful; zero-job not_sent is silence.
    return summary.reason !== null;
  }

  if (summary.state === 'sent') {
    // Success is not "news" once the inbox already holds the alert.
    return false;
  }

  // queued
  if (summary.pending <= 0) return false;

  const now = options.now ?? Date.now();
  const createdAge = ageMs(options.notificationCreatedAt, now);
  const updatedAge = ageMs(summary.updatedAt, now);
  // Prefer notification age; fall back to summary.updatedAt; if neither is
  // known, hide rather than claim an indefinite handoff.
  const age = createdAge ?? updatedAge;
  if (age === null) return false;
  return age <= DELIVERY_QUEUED_POLL_CAP_MS;
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
