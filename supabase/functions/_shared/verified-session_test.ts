import { assertEquals } from '@std/assert';

import { sessionIdFromVerifiedJwt } from './verified-session.ts';

function token(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${encoded}.signature`;
}

Deno.test('extracts session id only for the already-verified user', () => {
  const sessionId = '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11';
  const jwt = token({ sub: 'user-a', session_id: sessionId });
  assertEquals(sessionIdFromVerifiedJwt(jwt, 'user-a'), sessionId);
  assertEquals(sessionIdFromVerifiedJwt(jwt, 'user-b'), null);
});

Deno.test('rejects malformed or non-uuid session claims', () => {
  assertEquals(sessionIdFromVerifiedJwt('not-a-jwt', 'user-a'), null);
  assertEquals(sessionIdFromVerifiedJwt(token({ sub: 'user-a', session_id: 'bad' }), 'user-a'), null);
});
