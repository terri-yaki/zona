import { assertEquals, assertThrows } from '@std/assert';

import { idempotencyKey, optionalString, requiredString, uuid } from './validation.ts';

Deno.test('string helpers trim accepted values', () => {
  assertEquals(requiredString('  Office PC  ', 80), 'Office PC');
  assertEquals(optionalString('  render-01  ', 255), 'render-01');
  assertEquals(optionalString(undefined, 255), null);
});

Deno.test('invalid source identifiers are rejected', () => {
  assertThrows(() => uuid('not-a-uuid'));
  assertEquals(uuid('05c46ccb-0a9e-48c1-9b19-e0398f6ea69b'), '05c46ccb-0a9e-48c1-9b19-e0398f6ea69b');
});

Deno.test('idempotency keys are bounded and use transport-safe characters', () => {
  assertEquals(idempotencyKey('  event:build-123  '), 'event:build-123');
  assertThrows(() => idempotencyKey('short'));
  assertThrows(() => idempotencyKey('event key with spaces'));
  assertThrows(() => idempotencyKey(`event-${'x'.repeat(123)}`));
});
