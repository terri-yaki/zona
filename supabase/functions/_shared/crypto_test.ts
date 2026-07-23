import { assert, assertEquals, assertMatch } from '@std/assert';

import { createSourceToken, sha256 } from './crypto.ts';

Deno.test('source tokens are opaque and unique', () => {
  const first = createSourceToken();
  const second = createSourceToken();
  assertMatch(first, /^zona_live_[A-Za-z0-9_-]{43}$/);
  assert(first !== second);
});

Deno.test('sha256 returns a stable lowercase hex digest', async () => {
  assertEquals(await sha256('zona'), '3120efeb39ee61f07de802c09d35ffc8551930074c333d136a6801536a623db6');
});
