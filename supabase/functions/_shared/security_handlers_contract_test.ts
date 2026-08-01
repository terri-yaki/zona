import { assertEquals } from '@std/assert';

import { accountActions, bearerValue, isUuid, mostRecentProofIdentity, parseAccountAction, parseActionTarget } from './account-actions.ts';
import { resolveDeviceSound, resolveSound } from './push.ts';
import { classifyExpoFailure, receiptError } from './push-delivery.ts';
import { sessionIdFromVerifiedJwt } from './verified-session.ts';

/**
 * Contract coverage for v0.0.8 security/delivery handlers. Full Deno.serve
 * handlers need live Auth/service secrets; these pure contracts pin the
 * request/response rules those handlers implement.
 */

Deno.test('reauthenticate / account-security action contracts', () => {
  assertEquals(accountActions.includes('account.delete'), true);
  assertEquals(parseAccountAction('identity.unlink'), 'identity.unlink');
  assertEquals(parseAccountAction('account.export'), null);
  assertEquals(parseActionTarget('identity.link', 'email:user@example.com'), 'email:user@example.com');
  assertEquals(parseActionTarget('identity.link', 'provider:google'), 'provider:google');
  assertEquals(parseActionTarget('identity.link', 'provider:facebook'), null);
  assertEquals(parseActionTarget('installation.revoke', 'not-a-uuid'), null);
  assertEquals(parseActionTarget('sessions.revoke.all', ''), '');
  assertEquals(parseActionTarget('sessions.revoke.all', 'extra'), null);
  assertEquals(parseActionTarget('account.delete', ''), '');
});

Deno.test('reauthenticate proof bearer and fresh-identity contracts', () => {
  const token = `Bearer ${'a'.repeat(40)}`;
  assertEquals(bearerValue(token)?.length, 40);
  assertEquals(bearerValue('Token abc'), null);
  const now = Date.now();
  const recent = mostRecentProofIdentity([
    { identity_id: 'old', last_sign_in_at: new Date(now - 11 * 60_000).toISOString() },
    { identity_id: 'fresh', last_sign_in_at: new Date(now - 30_000).toISOString() },
  ], now);
  assertEquals(recent?.identity_id, 'fresh');
});

Deno.test('auth-transaction and account-transfer uuid contracts', () => {
  assertEquals(isUuid('53bf5cb8-57ea-4b7b-82ee-209ed59e3f11'), true);
  assertEquals(isUuid('device-legacy-id'), false);
  const sessionId = '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11';
  const encoded = btoa(JSON.stringify({ sub: 'user-a', session_id: sessionId }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  assertEquals(sessionIdFromVerifiedJwt(`h.${encoded}.s`, 'user-a'), sessionId);
  assertEquals(sessionIdFromVerifiedJwt(`h.${encoded}.s`, 'user-b'), null);
});

Deno.test('delete-account protected reauth grant shape', () => {
  const valid = `zona_reauth_${'ab'.repeat(32)}`;
  assertEquals(/^zona_reauth_[0-9a-f]{64}$/.test(valid), true);
  assertEquals(/^zona_reauth_[0-9a-f]{64}$/.test('zona_reauth_short'), false);
});

Deno.test('push-delivery-worker muted sound and receipt contracts', () => {
  // SQL collapses play_sound=false to sound_name='silent'; the worker must
  // resolve that to a null Expo sound on both platforms.
  assertEquals(resolveDeviceSound('android', resolveSound(true, 'silent')), null);
  assertEquals(resolveDeviceSound('ios', resolveSound(true, 'silent')), null);
  assertEquals(resolveDeviceSound('android', resolveSound(true, 'ios-note.wav')), 'default');
  assertEquals(classifyExpoFailure('DeviceNotRegistered').permanent, true);
  assertEquals(receiptError({ status: 'ok' }), { delivered: true });
  const retryable = receiptError({ status: 'error', details: { error: 'MessageRateExceeded' } });
  assertEquals(retryable && !retryable.delivered ? retryable.permanent : true, false);
});
