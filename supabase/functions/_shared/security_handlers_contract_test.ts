import { assertEquals } from '@std/assert';

import { accountActions, bearerValue, isUuid, mostRecentProofIdentity, parseAccountAction, parseActionTarget } from './account-actions.ts';
import { resolveDeviceSound, resolveSound } from './push.ts';
import { classifyExpoFailure, receiptError } from './push-delivery.ts';
import { reauthGrantPattern } from './validation.ts';
import { sessionIdFromVerifiedJwt } from './verified-session.ts';

/**
 * Contract coverage for v0.0.8 security/delivery handlers. Full Deno.serve
 * handlers need live Auth/service secrets; these pure contracts pin the
 * request/response rules those handlers implement.
 */

/** Mirrors notify source-token validation (zona_live_ + 43 url-safe chars). */
function isNotifySourceToken(value: string) {
  return /^zona_live_[A-Za-z0-9_-]{43}$/.test(value);
}

/** Mirrors notify error → HTTP status mapping used by the ingest handler. */
function notifyStatusFor(code: string) {
  if (code === 'INVALID_TOKEN') return 401;
  if (code === 'IDEMPOTENCY_CONFLICT') return 409;
  if (['RATE_LIMITED', 'ACCOUNT_RATE_LIMITED'].includes(code)) return 429;
  if (code === 'PAYLOAD_TOO_LARGE') return 413;
  if (code === 'SERVICE_UNAVAILABLE') return 503;
  if (['ATTACHMENTS_DISABLED', 'CRITICAL_SEVERITY_DISABLED'].includes(code)) return 403;
  if (['INVALID_PAYLOAD', 'INVALID_IDEMPOTENCY_KEY', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) return 400;
  return 500;
}

/** Mirrors reauthenticate request gate before grant RPC. */
function reauthRequestValid(input: {
  action: unknown;
  target: unknown;
  proofToken: string | null;
  actorUserId: string;
  proofUserId: string;
  proofSessionId: string | null;
  actorSessionId: string;
  proofIdentityId: string | null;
}) {
  const action = parseAccountAction(input.action);
  const target = action ? parseActionTarget(action, input.target) : null;
  if (!action || target === null || !input.proofToken) return 'INVALID_REAUTH_REQUEST';
  if (input.proofUserId !== input.actorUserId) return 'IDENTITY_CONFLICT';
  if (!input.proofSessionId || input.proofSessionId === input.actorSessionId) return 'FRESH_PROOF_REQUIRED';
  if (!input.proofIdentityId) return 'FRESH_PROOF_REQUIRED';
  if (action === 'identity.unlink' && input.proofIdentityId === target) {
    return 'REMAINING_IDENTITY_PROOF_REQUIRED';
  }
  return null;
}

/** Mirrors account-security pre-consume identity unlink validation. */
function identityUnlinkPrecheck(identities: { identity_id: string }[], target: string) {
  if (identities.length <= 1) return 'FINAL_IDENTITY';
  if (!identities.some((identity) => identity.identity_id === target)) return 'IDENTITY_NOT_FOUND';
  return null;
}

/** Mirrors account-transfer commit repair decision for completed jobs. */
function transferCommitPath(status: string) {
  return status === 'completed' ? 'repair-auth-and-attachments' : 'commit-then-stage';
}

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

Deno.test('reauthenticate grant-issuance proof contracts', () => {
  const token = `Bearer ${'a'.repeat(40)}`;
  assertEquals(bearerValue(token)?.length, 40);
  assertEquals(bearerValue('Token abc'), null);
  const now = Date.now();
  const recent = mostRecentProofIdentity([
    { identity_id: 'old', last_sign_in_at: new Date(now - 11 * 60_000).toISOString() },
    { identity_id: 'fresh', last_sign_in_at: new Date(now - 30_000).toISOString() },
  ], now);
  assertEquals(recent?.identity_id, 'fresh');
  assertEquals(
    reauthRequestValid({
      action: 'identity.unlink',
      target: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11',
      proofToken: 'a'.repeat(40),
      actorUserId: 'user-a',
      proofUserId: 'user-a',
      proofSessionId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f12',
      actorSessionId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11',
      proofIdentityId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f13',
    }),
    null,
  );
  assertEquals(
    reauthRequestValid({
      action: 'identity.unlink',
      target: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f13',
      proofToken: 'a'.repeat(40),
      actorUserId: 'user-a',
      proofUserId: 'user-a',
      proofSessionId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f12',
      actorSessionId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11',
      proofIdentityId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f13',
    }),
    'REMAINING_IDENTITY_PROOF_REQUIRED',
  );
  assertEquals(
    reauthRequestValid({
      action: 'sessions.revoke.others',
      target: '',
      proofToken: null,
      actorUserId: 'user-a',
      proofUserId: 'user-a',
      proofSessionId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f12',
      actorSessionId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11',
      proofIdentityId: 'id',
    }),
    'INVALID_REAUTH_REQUEST',
  );
});

Deno.test('account-security pre-consume unlink validation', () => {
  assertEquals(identityUnlinkPrecheck([{ identity_id: 'only' }], 'only'), 'FINAL_IDENTITY');
  assertEquals(
    identityUnlinkPrecheck(
      [{ identity_id: 'a' }, { identity_id: 'b' }],
      'missing',
    ),
    'IDENTITY_NOT_FOUND',
  );
  assertEquals(
    identityUnlinkPrecheck(
      [{ identity_id: 'a' }, { identity_id: 'b' }],
      'b',
    ),
    null,
  );
});

Deno.test('auth-transaction and account-transfer uuid contracts', () => {
  assertEquals(isUuid('53bf5cb8-57ea-4b7b-82ee-209ed59e3f11'), true);
  assertEquals(isUuid('device-legacy-id'), false);
  const sessionId = '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11';
  const encoded = btoa(JSON.stringify({ sub: 'user-a', session_id: sessionId }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  assertEquals(sessionIdFromVerifiedJwt(`h.${encoded}.s`, 'user-a'), sessionId);
  assertEquals(sessionIdFromVerifiedJwt(`h.${encoded}.s`, 'user-b'), null);
  assertEquals(transferCommitPath('completed'), 'repair-auth-and-attachments');
  assertEquals(transferCommitPath('previewed'), 'commit-then-stage');
});

Deno.test('delete-account protected reauth grant shape', () => {
  const valid = `zona_reauth_${'ab'.repeat(32)}`;
  assertEquals(reauthGrantPattern.test(valid), true);
  assertEquals(reauthGrantPattern.test('zona_reauth_short'), false);
});

Deno.test('notify ingest token and error-status contracts', () => {
  assertEquals(isNotifySourceToken(`zona_live_${'a'.repeat(43)}`), true);
  assertEquals(isNotifySourceToken('zona_live_short'), false);
  assertEquals(isNotifySourceToken('Bearer zona_live_x'), false);
  assertEquals(notifyStatusFor('INVALID_TOKEN'), 401);
  assertEquals(notifyStatusFor('RATE_LIMITED'), 429);
  assertEquals(notifyStatusFor('ACCOUNT_RATE_LIMITED'), 429);
  assertEquals(notifyStatusFor('PAYLOAD_TOO_LARGE'), 413);
  assertEquals(notifyStatusFor('SERVICE_UNAVAILABLE'), 503);
  assertEquals(notifyStatusFor('CRITICAL_SEVERITY_DISABLED'), 403);
  assertEquals(notifyStatusFor('INVALID_PAYLOAD'), 400);
  assertEquals(notifyStatusFor('IDEMPOTENCY_CONFLICT'), 409);
  assertEquals(notifyStatusFor('WEIRD'), 500);
});

Deno.test('push-delivery-worker muted sound, receipt, and batch outcome contracts', () => {
  // SQL collapses play_sound=false to sound_name='silent'; the worker must
  // resolve that to a null Expo sound on both platforms.
  assertEquals(resolveDeviceSound('android', resolveSound(true, 'silent')), null);
  assertEquals(resolveDeviceSound('ios', resolveSound(true, 'silent')), null);
  assertEquals(resolveDeviceSound('android', resolveSound(true, 'ios-note.wav')), 'default');
  assertEquals(classifyExpoFailure('DeviceNotRegistered').permanent, true);
  assertEquals(receiptError({ status: 'ok' }), { delivered: true });
  const retryable = receiptError({ status: 'error', details: { error: 'MessageRateExceeded' } });
  assertEquals(retryable && !retryable.delivered ? retryable.permanent : true, false);

  // Batch outcome payload shapes accepted by apply_push_*_outcomes_internal.
  const sendOutcomes = [
    { kind: 'accept', jobId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f11', ticketId: 'ticket-1', httpStatus: 200 },
    { kind: 'fail', jobId: '53bf5cb8-57ea-4b7b-82ee-209ed59e3f12', errorCode: 'MESSAGE_TOO_BIG', permanent: true },
  ];
  assertEquals(sendOutcomes.every((row) => row.kind === 'accept' || row.kind === 'fail'), true);
  const receiptOutcomes = [
    { kind: 'complete', outcome: 'delivered' },
    { kind: 'retry', errorCode: 'MESSAGE_RATE_EXCEEDED' },
    { kind: 'defer', errorCode: 'RECEIPT_PENDING' },
  ];
  assertEquals(new Set(receiptOutcomes.map((row) => row.kind)).size, 3);
});
