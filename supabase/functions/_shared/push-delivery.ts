export type DeliveryErrorCode =
  | 'DEVICE_NOT_REGISTERED'
  | 'MESSAGE_TOO_BIG'
  | 'MESSAGE_RATE_EXCEEDED'
  | 'MISMATCH_SENDER_ID'
  | 'INVALID_CREDENTIALS'
  | 'EXPO_TIMEOUT'
  | 'EXPO_UNAVAILABLE'
  | 'EXPO_INVALID_RESPONSE'
  | 'UNKNOWN_EXPO_ERROR';

const permanent = new Set<DeliveryErrorCode>([
  'DEVICE_NOT_REGISTERED',
  'MESSAGE_TOO_BIG',
  'MISMATCH_SENDER_ID',
  'INVALID_CREDENTIALS',
]);

const expoCodes: Record<string, DeliveryErrorCode> = {
  DeviceNotRegistered: 'DEVICE_NOT_REGISTERED',
  MessageTooBig: 'MESSAGE_TOO_BIG',
  MessageRateExceeded: 'MESSAGE_RATE_EXCEEDED',
  MismatchSenderId: 'MISMATCH_SENDER_ID',
  InvalidCredentials: 'INVALID_CREDENTIALS',
};

export function classifyExpoFailure(value: unknown, httpStatus?: number | null) {
  const code = typeof value === 'string' && expoCodes[value]
    ? expoCodes[value]
    : httpStatus === 429
    ? 'MESSAGE_RATE_EXCEEDED'
    : typeof httpStatus === 'number' && httpStatus >= 500
    ? 'EXPO_UNAVAILABLE'
    : 'UNKNOWN_EXPO_ERROR';
  return { code, permanent: permanent.has(code) };
}

export function requestFailure(error: unknown) {
  return error instanceof DOMException && error.name === 'TimeoutError'
    ? { code: 'EXPO_TIMEOUT' as const, permanent: false }
    : { code: 'EXPO_UNAVAILABLE' as const, permanent: false };
}

export function receiptError(receipt: unknown) {
  if (!receipt || typeof receipt !== 'object') return null;
  const value = receipt as { status?: unknown; details?: { error?: unknown } };
  if (value.status === 'ok') return { delivered: true as const };
  if (value.status !== 'error') return null;
  const classified = classifyExpoFailure(value.details?.error);
  return { delivered: false as const, ...classified };
}
