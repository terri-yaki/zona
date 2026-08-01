import { assertEquals, assertRejects } from '@std/assert';

import { readBodyBytes, readJson } from './http.ts';

Deno.test('readBodyBytes enforces a stream byte cap without Content-Length', async () => {
  const body = new Uint8Array(64).fill(1);
  const request = new Request('https://example.test', {
    method: 'POST',
    body,
  });
  await assertRejects(() => readBodyBytes(request, 16), Error, 'PAYLOAD_TOO_LARGE');
});

Deno.test('readBodyBytes rejects an understated Content-Length that still exceeds the cap', async () => {
  const body = new Uint8Array(32).fill(2);
  const request = new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-length': '8' },
    body,
  });
  // Declared length is under the cap, but the stream still exceeds it.
  await assertRejects(() => readBodyBytes(request, 16), Error, 'PAYLOAD_TOO_LARGE');
});

Deno.test('readJson keeps the JSON content-type and object shape contracts', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'register' }),
  });
  assertEquals(await readJson(request), { action: 'register' });
});
