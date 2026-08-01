import { assertEquals } from '@std/assert';

import { classifyExpoFailure, receiptError } from './push-delivery.ts';

Deno.test('classifies permanent device and credential errors without raw payloads', () => {
  assertEquals(classifyExpoFailure('DeviceNotRegistered'), {
    code: 'DEVICE_NOT_REGISTERED',
    permanent: true,
  });
  assertEquals(classifyExpoFailure('InvalidCredentials'), {
    code: 'INVALID_CREDENTIALS',
    permanent: true,
  });
});

Deno.test('classifies retryable Expo pressure and service errors', () => {
  assertEquals(classifyExpoFailure('MessageRateExceeded'), {
    code: 'MESSAGE_RATE_EXCEEDED',
    permanent: false,
  });
  assertEquals(classifyExpoFailure(null, 503), {
    code: 'EXPO_UNAVAILABLE',
    permanent: false,
  });
});

Deno.test('receipt parser distinguishes delivery, errors, and missing receipts', () => {
  assertEquals(receiptError({ status: 'ok' }), { delivered: true });
  assertEquals(receiptError({ status: 'error', details: { error: 'DeviceNotRegistered' } }), {
    delivered: false,
    code: 'DEVICE_NOT_REGISTERED',
    permanent: true,
  });
  assertEquals(receiptError({ status: 'error', details: { error: 'MessageRateExceeded' } }), {
    delivered: false,
    code: 'MESSAGE_RATE_EXCEEDED',
    permanent: false,
  });
  assertEquals(receiptError({ status: 'error', details: { error: 'FutureRetryableError' } }), {
    delivered: false,
    code: 'UNKNOWN_EXPO_ERROR',
    permanent: false,
  });
  assertEquals(receiptError(undefined), null);
});
