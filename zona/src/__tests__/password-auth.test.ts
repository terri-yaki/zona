import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setActiveLanguage, translate } from '../i18n';
import { validateAuthPassword, utf8ByteLength } from '../lib/validation';

beforeEach(() => setActiveLanguage('en'));

const beginAuthTransaction = vi.fn();
const cancelAuthTransaction = vi.fn();
const clearPendingPassword = vi.fn();
const consumeAuthTransaction = vi.fn();
const getAuthTransaction = vi.fn();
const getSession = vi.fn();
const resend = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const stashPendingPassword = vi.fn();
const takePendingPassword = vi.fn();
const updateUser = vi.fn();
const verifyOtp = vi.fn();
const getUser = vi.fn();

vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));
vi.mock('expo-linking', () => ({
  createURL: (_path: string, options?: { queryParams?: Record<string, string> }) =>
    `zona://auth/callback?zona_tx=${options?.queryParams?.zona_tx ?? ''}`,
  parse: () => ({ queryParams: {} }),
}));
vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: () => undefined,
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
vi.mock('../lib/auth-transactions', () => ({
  beginAuthTransaction: (...args: unknown[]) => beginAuthTransaction(...args),
  cancelAuthTransaction: (...args: unknown[]) => cancelAuthTransaction(...args),
  clearPendingPassword: (...args: unknown[]) => clearPendingPassword(...args),
  consumeAuthTransaction: (...args: unknown[]) => consumeAuthTransaction(...args),
  getAuthTransaction: (...args: unknown[]) => getAuthTransaction(...args),
  isAuthIntent: (value: unknown) =>
    value === 'link_method' || value === 'protect_guest' || value === 'sign_in' || value === 'sign_up',
  stashPendingPassword: (...args: unknown[]) => stashPendingPassword(...args),
  takePendingPassword: (...args: unknown[]) => takePendingPassword(...args),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      resend: (...args: unknown[]) => resend(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      getUser: (...args: unknown[]) => getUser(...args),
    },
  },
}));

// eslint-disable-next-line import/first
import {
  describeAuthError,
  resendEmailVerification,
  startPasswordAuth,
  verifyEmailAuthCode,
} from '../lib/auth-flow';

const transaction = {
  createdAt: Date.now(),
  email: 'user@example.com',
  expiresAt: Date.now() + 60_000,
  expectedUserId: null as string | null,
  id: 'tx-1',
  intent: 'sign_in' as const,
  provider: 'email' as const,
};

describe('validateAuthPassword', () => {
  it('accepts a password between 8 and 72 UTF-8 bytes', () => {
    expect(validateAuthPassword('abcdefgh')).toBeNull();
    expect(validateAuthPassword('a'.repeat(72))).toBeNull();
  });

  it('rejects passwords shorter than 8 bytes', () => {
    expect(validateAuthPassword('a'.repeat(7))).toBe(translate('validation.passwordTooShort', { count: 8 }));
  });

  it('rejects passwords longer than 72 bytes', () => {
    expect(validateAuthPassword('a'.repeat(73))).toBe(translate('validation.passwordTooLong', { count: 72 }));
  });

  it('counts UTF-8 bytes, not JS string length', () => {
    expect(utf8ByteLength('中文')).toBe(6);
    const sevenBytes = '中文a'; // 3 + 3 + 1 = 7 bytes
    const eightBytes = '中文ab'; // 3 + 3 + 2 = 8 bytes
    expect(utf8ByteLength(sevenBytes)).toBe(7);
    expect(utf8ByteLength(eightBytes)).toBe(8);
    expect(validateAuthPassword(sevenBytes)).toBe(translate('validation.passwordTooShort', { count: 8 }));
    expect(validateAuthPassword(eightBytes)).toBeNull();
    const seventyTwoBytes = '中文'.repeat(12); // 72 bytes
    const seventyThreeBytes = '中文'.repeat(12) + 'a'; // 73 bytes
    expect(utf8ByteLength(seventyTwoBytes)).toBe(72);
    expect(utf8ByteLength(seventyThreeBytes)).toBe(73);
    expect(validateAuthPassword(seventyTwoBytes)).toBeNull();
    expect(validateAuthPassword(seventyThreeBytes)).toBe(translate('validation.passwordTooLong', { count: 72 }));
  });

  it('rejects leading or trailing whitespace', () => {
    expect(validateAuthPassword(' password123')).toBe(translate('validation.passwordWhitespace'));
    expect(validateAuthPassword('password123 ')).toBe(translate('validation.passwordWhitespace'));
    expect(validateAuthPassword(' password123 ')).toBe(translate('validation.passwordWhitespace'));
  });

  it('allows internal whitespace', () => {
    expect(validateAuthPassword('pass word 123')).toBeNull();
  });
});

describe('startPasswordAuth password forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    beginAuthTransaction.mockResolvedValue(transaction);
    cancelAuthTransaction.mockResolvedValue(undefined);
    consumeAuthTransaction.mockResolvedValue(undefined);
    signInWithPassword.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } }, error: null });
    signUp.mockResolvedValue({ data: { user: { id: 'user-a' }, session: null }, error: null });
    updateUser.mockResolvedValue({ data: { user: { id: 'user-a', new_email: null } }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    verifyOtp.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
  });

  it('forwards the exact password bytes to signInWithPassword without trimming', async () => {
    const password = '  pässwörd 中文  ';
    await startPasswordAuth('user@example.com', password, 'sign_in');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password });
  });

  it('forwards the exact password bytes to signUp without trimming', async () => {
    const password = 'pässwörd中文';
    await startPasswordAuth('user@example.com', password, 'sign_up');
    expect(signUp).toHaveBeenCalledWith({ email: 'user@example.com', password });
  });

  it('sets password only when the signed-in user already has that email verified', async () => {
    getSession
      .mockResolvedValueOnce({
        data: {
          session: {
            user: {
              id: 'user-a',
              email: 'user@example.com',
              email_confirmed_at: '2026-08-01T00:00:00.000Z',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          session: {
            user: {
              id: 'user-a',
              email: 'user@example.com',
              email_confirmed_at: '2026-08-01T00:00:00.000Z',
            },
          },
        },
      });
    const password = 'pässwörd中文';
    await startPasswordAuth('user@example.com', password, 'link_method');
    expect(updateUser).toHaveBeenCalledWith({ password });
    expect(stashPendingPassword).not.toHaveBeenCalled();
  });

  it('stashes the password and only links email when the address is not verified yet', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-a', email: null, email_confirmed_at: null, is_anonymous: true } } },
    });
    beginAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'user-a', intent: 'protect_guest' });
    updateUser.mockResolvedValue({
      data: { user: { id: 'user-a', new_email: 'user@example.com', email_confirmed_at: null } },
      error: null,
    });
    const password = 'pässwörd中文';
    const result = await startPasswordAuth('user@example.com', password, 'protect_guest');
    expect(stashPendingPassword).toHaveBeenCalledWith('tx-1', password);
    expect(updateUser).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(updateUser).not.toHaveBeenCalledWith(expect.objectContaining({ password }));
    expect(result).toMatchObject({ id: 'tx-1', intent: 'protect_guest' });
  });
});

describe('verifyEmailAuthCode signup confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthTransaction.mockResolvedValue({ ...transaction, confirmation: 'signup', intent: 'sign_up' });
    verifyOtp.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    consumeAuthTransaction.mockResolvedValue(undefined);
  });

  it('uses OTP type signup for signup-marked transactions', async () => {
    await verifyEmailAuthCode({ code: '123456', email: 'user@example.com', transactionId: 'tx-1' });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'signup',
    });
  });

  it('uses OTP type email_change for password-link confirmation transactions', async () => {
    getAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'user-a', intent: 'link_method' });
    takePendingPassword.mockResolvedValue(null);
    await verifyEmailAuthCode({ code: '123456', email: 'user@example.com', transactionId: 'tx-1' });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'email_change',
    });
  });

  it('applies a stashed password after email_change verification succeeds', async () => {
    getAuthTransaction.mockResolvedValue({
      ...transaction,
      expectedUserId: 'user-a',
      intent: 'protect_guest',
    });
    takePendingPassword.mockResolvedValue('stashed-password');
    updateUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    await verifyEmailAuthCode({ code: '123456', email: 'user@example.com', transactionId: 'tx-1' });
    expect(takePendingPassword).toHaveBeenCalledWith('tx-1');
    expect(updateUser).toHaveBeenCalledWith({ password: 'stashed-password' });
  });
});

describe('describeAuthError', () => {
  it('maps the wrong-password response to the localized non-enumerating message', () => {
    expect(describeAuthError(new Error('Invalid login credentials'), 'fallback'))
      .toBe(translate('auth.passwordInvalid'));
  });

  it('maps the unconfirmed-email response to the localized message', () => {
    expect(describeAuthError(new Error('Email not confirmed'), 'fallback'))
      .toBe(translate('auth.emailNotConfirmed'));
  });

  it('maps AuthApiError codes as well as messages', () => {
    expect(describeAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'fallback'))
      .toBe(translate('auth.emailNotConfirmed'));
    expect(describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'fallback'))
      .toBe(translate('auth.passwordInvalid'));
  });

  it('maps coded errors to their localized messages', () => {
    expect(describeAuthError(new Error('EMAIL_IN_USE'), 'fallback')).toBe(translate('auth.emailInUse'));
    expect(describeAuthError(new Error('INVALID_EMAIL'), 'fallback')).toBe(translate('auth.emailInvalid'));
  });

  it('passes other error messages through and uses the fallback for non-errors', () => {
    expect(describeAuthError(new Error('network down'), 'fallback')).toBe('network down');
    expect(describeAuthError(null, 'fallback')).toBe('fallback');
  });
});

describe('resendEmailVerification branching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resend.mockResolvedValue({ data: {}, error: null });
    beginAuthTransaction.mockResolvedValue({ ...transaction, id: 'tx-2' });
  });

  it('uses resend type signup and begins a fresh signup-marked transaction', async () => {
    getAuthTransaction.mockResolvedValue({ ...transaction, confirmation: 'signup', intent: 'sign_up' });
    await resendEmailVerification('user@example.com', 'tx-1');
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@example.com' });
    expect(beginAuthTransaction).toHaveBeenCalledWith({
      confirmation: 'signup',
      email: 'user@example.com',
      expectedUserId: null,
      intent: 'sign_up',
      provider: 'email',
    });
  });

  it('uses resend type email_change for link_method transactions', async () => {
    getAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'user-a', intent: 'link_method' });
    await resendEmailVerification('user@example.com', 'tx-1');
    expect(resend).toHaveBeenCalledWith({ type: 'email_change', email: 'user@example.com' });
    expect(beginAuthTransaction).toHaveBeenCalledWith({
      email: 'user@example.com',
      expectedUserId: 'user-a',
      intent: 'link_method',
      provider: 'email',
    });
  });

  it('throws for plain sign-in transactions so the caller can use sendEmailAuth', async () => {
    getAuthTransaction.mockResolvedValue(transaction);
    await expect(resendEmailVerification('user@example.com', 'tx-1')).rejects.toThrow('AUTH_TRANSACTION_MISMATCH');
    expect(resend).not.toHaveBeenCalled();
  });

  it('throws when the stored transaction has expired', async () => {
    getAuthTransaction.mockResolvedValue(null);
    await expect(resendEmailVerification('user@example.com', 'tx-1')).rejects.toThrow('AUTH_TRANSACTION_EXPIRED');
  });
});
