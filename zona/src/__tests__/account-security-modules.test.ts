import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-publishable-key',
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));
vi.mock('expo-linking', () => ({
  createURL: () => 'zona://auth/callback',
  parse: () => ({ queryParams: {} }),
}));
vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: () => undefined,
  openAuthSessionAsync: async () => ({ type: 'cancel' }),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (value: { ios?: string; default?: string }) => value.ios ?? value.default },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

// eslint-disable-next-line import/first
import { isSensitiveAccountAction, sensitiveAccountActions } from '../lib/account-security';
// eslint-disable-next-line import/first
import { parseAccountTransferResponse } from '../lib/account-transfer';
// eslint-disable-next-line import/first
import {
  fallbackAuthCapabilities,
  firstJoinShowsNonGuestMethods,
  nonGuestAuthMethodsEnabled,
  parseAuthCapabilities,
} from '../lib/auth-capabilities';
// eslint-disable-next-line import/first
import { normalizeAuthEmail } from '../lib/auth-flow';
// eslint-disable-next-line import/first
import { isAuthIntent } from '../lib/auth-transactions';
// eslint-disable-next-line import/first
import { normalizeSecondaryEmail } from '../lib/secondary-auth';

describe('sensitive account actions', () => {
  it('accepts the reauth-bound action set used by account security', () => {
    expect(sensitiveAccountActions).toEqual([
      'account.delete',
      'identity.link',
      'identity.unlink',
      'installation.revoke',
      'sessions.revoke.others',
      'sessions.revoke.all',
    ]);
    expect(isSensitiveAccountAction('identity.unlink')).toBe(true);
    expect(isSensitiveAccountAction('sessions.revoke')).toBe(false);
  });
});

describe('account transfer response parsing', () => {
  it('accepts a complete transfer preview payload', () => {
    expect(parseAccountTransferResponse({
      transferId: 'tx-1',
      status: 'previewed',
      expiresAt: '2026-08-01T00:00:00.000Z',
      preview: {
        activeKeys: 2,
        attachments: 1,
        destinationKeepsPreferences: true,
        keyLimitConflict: false,
        phoneLimitConflict: false,
        sourceLimitConflict: true,
        notifications: 4,
        sources: 3,
      },
    })).toEqual({
      transferId: 'tx-1',
      status: 'previewed',
      expiresAt: '2026-08-01T00:00:00.000Z',
      preview: {
        activeKeys: 2,
        attachments: 1,
        destinationKeepsPreferences: true,
        keyLimitConflict: false,
        phoneLimitConflict: false,
        sourceLimitConflict: true,
        notifications: 4,
        sources: 3,
      },
    });
  });

  it('rejects malformed transfer payloads and clamps invalid counts', () => {
    expect(() => parseAccountTransferResponse({ transferId: 'tx-1' }))
      .toThrowError('INVALID_TRANSFER_RESPONSE');
    expect(parseAccountTransferResponse({
      transferId: 'tx-1',
      status: 'previewed',
      expiresAt: '2026-08-01T00:00:00.000Z',
      preview: { sources: -1 },
    }).preview.sources).toBe(0);
  });
});

describe('auth capabilities parsing', () => {
  it('reads Auth settings external flags with product-safe defaults', () => {
    expect(parseAuthCapabilities({
      external: { email: true, google: true, apple: 'yes', anonymous_users: false },
    })).toEqual({
      anonymous: false,
      // Non-boolean apple falls back to product default (enabled).
      apple: true,
      email: true,
      github: true,
      google: true,
    });
    expect(parseAuthCapabilities(null)).toEqual(fallbackAuthCapabilities);
  });

  it('keeps email and OAuth visible when settings omit keys or fail (fallback)', () => {
    expect(fallbackAuthCapabilities.email).toBe(true);
    expect(fallbackAuthCapabilities.anonymous).toBe(true);
    expect(nonGuestAuthMethodsEnabled(fallbackAuthCapabilities)).toBe(true);
    expect(firstJoinShowsNonGuestMethods(fallbackAuthCapabilities)).toBe(true);
    expect(firstJoinShowsNonGuestMethods(parseAuthCapabilities({}))).toBe(true);
  });

  it('honors explicit server disables', () => {
    const disabled = parseAuthCapabilities({
      external: {
        anonymous_users: true,
        apple: false,
        email: false,
        github: false,
        google: false,
      },
    });
    expect(disabled).toEqual({
      anonymous: true,
      apple: false,
      email: false,
      github: false,
      google: false,
    });
    expect(firstJoinShowsNonGuestMethods(disabled)).toBe(false);
  });
});

describe('auth transaction intents', () => {
  it('accepts only the supported auth intents', () => {
    expect(isAuthIntent('sign_in')).toBe(true);
    expect(isAuthIntent('protect_guest')).toBe(true);
    expect(isAuthIntent('recover')).toBe(false);
  });
});

describe('email normalization for auth flows', () => {
  it('normalizes primary and secondary proof emails the same way', () => {
    expect(normalizeAuthEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(normalizeSecondaryEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(() => normalizeAuthEmail('not-an-email')).toThrowError('INVALID_EMAIL');
    expect(() => normalizeSecondaryEmail('not-an-email')).toThrowError('INVALID_EMAIL');
  });
});
