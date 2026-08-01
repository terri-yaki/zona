import { describe, expect, it } from 'vitest';

import { assertSameUserUpgrade, parseAuthCallbackUrl } from '../lib/auth-callback';

describe('auth callback parsing', () => {
  it('reads PKCE codes and Zona transaction state from a deep link', () => {
    expect(parseAuthCallbackUrl('zona://auth/callback?code=pkce-code&zona_tx=tx-123')).toEqual({
      code: 'pkce-code',
      error: null,
      errorDescription: null,
      tokenHash: null,
      transactionId: 'tx-123',
      type: null,
    });
  });

  it('supports token hash callbacks in URL fragments', () => {
    const parsed = parseAuthCallbackUrl('zona://auth/callback?zona_tx=tx-456#token_hash=secret&type=email');
    expect(parsed.tokenHash).toBe('secret');
    expect(parsed.type).toBe('email');
    expect(parsed.transactionId).toBe('tx-456');
  });

  it('keeps provider errors available to the callback screen', () => {
    const parsed = parseAuthCallbackUrl('zona://auth/callback?error=access_denied&error_description=Cancelled&zona_tx=tx-789');
    expect(parsed.error).toBe('access_denied');
    expect(parsed.errorDescription).toBe('Cancelled');
  });
});

describe('same-user upgrade guard', () => {
  it('accepts a guest upgrade that keeps the original Auth user', () => {
    expect(() => assertSameUserUpgrade('protect_guest', 'user-a', 'user-a')).not.toThrow();
  });

  it('blocks a linked method from switching to a different account', () => {
    expect(() => assertSameUserUpgrade('link_method', 'user-a', 'user-b'))
      .toThrowError('ACCOUNT_CHANGED_DURING_LINK');
  });

  it('allows a normal signed-out recovery to select its authenticated account', () => {
    expect(() => assertSameUserUpgrade('sign_in', null, 'user-b')).not.toThrow();
  });
});
