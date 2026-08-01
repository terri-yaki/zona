import { assertEquals } from '@std/assert';
import { bearerValue, mostRecentProofIdentity, parseAccountAction, parseActionTarget } from './account-actions.ts';

Deno.test('account actions reject unknown operations and malformed targets', () => {
  assertEquals(parseAccountAction('identity.unlink'), 'identity.unlink');
  assertEquals(parseAccountAction('shell.execute'), null);
  assertEquals(parseActionTarget('identity.unlink', 'not-a-uuid'), null);
  assertEquals(parseActionTarget('account.delete', ''), '');
  assertEquals(parseActionTarget('account.delete', 'extra'), null);
});

Deno.test('binds reauth to the identity used most recently', () => {
  const now = Date.parse('2026-07-30T00:10:00Z');
  const email = { identity_id: 'email-id', last_sign_in_at: '2026-07-30T00:01:00Z' };
  const google = { identity_id: 'google-id', last_sign_in_at: '2026-07-30T00:09:59Z' };
  assertEquals(mostRecentProofIdentity([email, google], now), google);
  assertEquals(mostRecentProofIdentity([google, { ...email, last_sign_in_at: '2026-07-30T00:10:00Z' }], now)?.identity_id, 'email-id');
});

Deno.test('reauth proof requires a bearer token', () => {
  assertEquals(bearerValue(null), null);
  assertEquals(bearerValue('token'), null);
  assertEquals(bearerValue(`Bearer ${'a'.repeat(40)}`), 'a'.repeat(40));
});
