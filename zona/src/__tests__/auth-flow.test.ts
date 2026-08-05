import { beforeEach, describe, expect, it, vi } from 'vitest';

const beginAuthTransaction = vi.fn();
const cancelAuthTransaction = vi.fn();
const consumeAuthTransaction = vi.fn();
const getAuthTransaction = vi.fn();
const getSession = vi.fn();
const resend = vi.fn();
const signInWithOtp = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const updateUser = vi.fn();
const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const linkIdentity = vi.fn();
const signInWithOAuth = vi.fn();
const openAuthSessionAsync = vi.fn();

vi.mock('../lib/env', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-publishable-key',
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));
vi.mock('expo-linking', () => ({
  createURL: (_path: string, options?: { queryParams?: Record<string, string> }) =>
    `zona://auth/callback?zona_tx=${options?.queryParams?.zona_tx ?? ''}`,
  parse: () => ({ queryParams: {} }),
}));
vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: () => undefined,
  openAuthSessionAsync: (...args: unknown[]) => openAuthSessionAsync(...args),
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
  consumeAuthTransaction: (...args: unknown[]) => consumeAuthTransaction(...args),
  getAuthTransaction: (...args: unknown[]) => getAuthTransaction(...args),
  isAuthIntent: (value: unknown) =>
    value === 'link_method' || value === 'protect_guest' || value === 'sign_in' || value === 'sign_up',
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      resend: (...args: unknown[]) => resend(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args),
      getUser: (...args: unknown[]) => getUser(...args),
      linkIdentity: (...args: unknown[]) => linkIdentity(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
    },
  },
}));

// eslint-disable-next-line import/first
import {
  completeAuthCallback,
  normalizeAuthEmail,
  startEmailAuth,
  startPasswordAuth,
  startProviderAuth,
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
  verifier: 'verifier',
};

describe('auth-flow recovery paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    beginAuthTransaction.mockResolvedValue(transaction);
    cancelAuthTransaction.mockResolvedValue(undefined);
    consumeAuthTransaction.mockResolvedValue(undefined);
    getAuthTransaction.mockResolvedValue(transaction);
    resend.mockResolvedValue({ data: {}, error: null });
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } }, error: null });
    signUp.mockResolvedValue({ data: { user: { id: 'user-a' }, session: null }, error: null });
    updateUser.mockResolvedValue({ data: { user: { id: 'user-a', new_email: null } }, error: null });
    verifyOtp.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-a' }, session: { user: { id: 'user-a' } } },
      error: null,
    });
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    linkIdentity.mockResolvedValue({ data: { url: 'https://provider.example/oauth' }, error: null });
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://provider.example/oauth' }, error: null });
    openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'zona://auth/callback?code=pkce&zona_tx=tx-1' });
  });

  it('normalizes emails before starting email auth', () => {
    expect(normalizeAuthEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(() => normalizeAuthEmail('bad')).toThrowError('INVALID_EMAIL');
  });

  it('startEmailAuth begins a transaction and sends OTP for sign-in', async () => {
    const result = await startEmailAuth('User@Example.COM', 'sign_in');
    expect(beginAuthTransaction).toHaveBeenCalledWith({
      email: 'user@example.com',
      expectedUserId: null,
      intent: 'sign_in',
      provider: 'email',
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      options: expect.objectContaining({ shouldCreateUser: false }),
    });
    expect(result.id).toBe('tx-1');
  });

  it('startEmailAuth requires a session for protect_guest and uses updateUser', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'guest-1' } } } });
    beginAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'guest-1', intent: 'protect_guest' });
    await startEmailAuth('owner@example.com', 'protect_guest');
    expect(beginAuthTransaction).toHaveBeenCalledWith({
      email: 'owner@example.com',
      expectedUserId: 'guest-1',
      intent: 'protect_guest',
      provider: 'email',
    });
    expect(updateUser).toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('startEmailAuth cancels the transaction when OTP delivery fails', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: new Error('smtp down') });
    await expect(startEmailAuth('user@example.com', 'sign_in')).rejects.toThrow('smtp down');
    expect(cancelAuthTransaction).toHaveBeenCalledWith('tx-1');
  });

  it('verifyEmailAuthCode checks transaction email and consumes on success', async () => {
    const user = await verifyEmailAuthCode({
      code: '123456',
      email: 'user@example.com',
      transactionId: 'tx-1',
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'email',
    });
    expect(consumeAuthTransaction).toHaveBeenCalledWith('tx-1');
    expect(user.id).toBe('user-a');
  });

  it('verifyEmailAuthCode rejects mismatched emails and expired transactions', async () => {
    await expect(verifyEmailAuthCode({
      code: '123456',
      email: 'other@example.com',
      transactionId: 'tx-1',
    })).rejects.toThrow('AUTH_TRANSACTION_MISMATCH');
    getAuthTransaction.mockResolvedValueOnce(null);
    await expect(verifyEmailAuthCode({
      code: '123456',
      email: 'user@example.com',
      transactionId: 'missing',
    })).rejects.toThrow('AUTH_TRANSACTION_EXPIRED');
  });

  it('startProviderAuth opens OAuth and completes the callback', async () => {
    const result = await startProviderAuth('google', 'sign_in');
    expect(signInWithOAuth).toHaveBeenCalled();
    expect(openAuthSessionAsync).toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce');
    expect(consumeAuthTransaction).toHaveBeenCalledWith('tx-1');
    expect(result).toEqual({ intent: 'sign_in', user: { id: 'user-a' } });
  });

  it('startProviderAuth returns null when the browser session is cancelled', async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    await expect(startProviderAuth('google', 'sign_in')).resolves.toBeNull();
    expect(cancelAuthTransaction).toHaveBeenCalledWith('tx-1');
  });

  it('completeAuthCallback rejects provider errors and missing transactions', async () => {
    await expect(completeAuthCallback({
      code: null,
      error: 'access_denied',
      errorDescription: 'Cancelled',
      tokenHash: null,
      transactionId: 'tx-1',
      type: null,
    })).rejects.toThrow('Cancelled');
    await expect(completeAuthCallback({
      code: 'pkce',
      error: null,
      errorDescription: null,
      tokenHash: null,
      transactionId: null,
      type: null,
    })).rejects.toThrow('AUTH_TRANSACTION_MISSING');
  });

  it('startPasswordAuth signs in with password and returns the session', async () => {
    const result = await startPasswordAuth('user@example.com', 'password123', 'sign_in');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password123' });
    expect(result).toEqual({ user: { id: 'user-a' } });
  });

  it('startPasswordAuth throws on password sign-in error', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error('Invalid login credentials') });
    await expect(startPasswordAuth('user@example.com', 'password123', 'sign_in')).rejects.toThrow('Invalid login credentials');
  });

  it('startPasswordAuth signs up, begins a signup-marked transaction, and returns it when confirmation is pending', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'user-a' }, session: null }, error: null });
    beginAuthTransaction.mockResolvedValue({ ...transaction, confirmation: 'signup', intent: 'sign_up' });
    const result = await startPasswordAuth('user@example.com', 'password123', 'sign_up');
    expect(beginAuthTransaction).toHaveBeenCalledWith({
      confirmation: 'signup',
      email: 'user@example.com',
      expectedUserId: null,
      intent: 'sign_up',
      provider: 'email',
    });
    expect('id' in result).toBe(true);
    expect((result as { confirmation?: string }).confirmation).toBe('signup');
    expect(consumeAuthTransaction).not.toHaveBeenCalled();
  });

  it('startPasswordAuth consumes the transaction when sign-up returns an immediate session', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'user-a' }, session: { user: { id: 'user-a' } } }, error: null });
    beginAuthTransaction.mockResolvedValue({ ...transaction, confirmation: 'signup', intent: 'sign_up' });
    const result = await startPasswordAuth('user@example.com', 'password123', 'sign_up');
    expect(consumeAuthTransaction).toHaveBeenCalledWith('tx-1');
    expect('id' in result).toBe(false);
  });

  it('startPasswordAuth cancels the transaction when sign-up fails', async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: new Error('email taken') });
    beginAuthTransaction.mockResolvedValue({ ...transaction, confirmation: 'signup', intent: 'sign_up' });
    await expect(startPasswordAuth('user@example.com', 'password123', 'sign_up')).rejects.toThrow('email taken');
    expect(cancelAuthTransaction).toHaveBeenCalledWith('tx-1');
  });

  it('startPasswordAuth links a password and routes to check-email when confirmation is pending', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'guest-1' } } } });
    updateUser.mockResolvedValue({ data: { user: { id: 'guest-1', new_email: 'owner@example.com' } }, error: null });
    beginAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'guest-1', intent: 'protect_guest' });
    const result = await startPasswordAuth('owner@example.com', 'password123', 'protect_guest');
    expect(updateUser).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'password123' });
    expect('id' in result).toBe(true);
    expect(consumeAuthTransaction).not.toHaveBeenCalled();
  });

  it('startPasswordAuth links a password, asserts same user, and returns the session when no confirmation is needed', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
    updateUser.mockResolvedValue({ data: { user: { id: 'user-a', new_email: null } }, error: null });
    beginAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'user-a', intent: 'link_method' });
    const result = await startPasswordAuth('owner@example.com', 'password123', 'link_method');
    expect(getUser).toHaveBeenCalled();
    expect(consumeAuthTransaction).toHaveBeenCalledWith('tx-1');
    expect('id' in result).toBe(false);
  });

  it('startPasswordAuth cancels the transaction when same-user assertion fails', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
    updateUser.mockResolvedValue({ data: { user: { id: 'user-a', new_email: null } }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    beginAuthTransaction.mockResolvedValue({ ...transaction, expectedUserId: 'user-a', intent: 'link_method' });
    await expect(startPasswordAuth('owner@example.com', 'password123', 'link_method')).rejects.toThrow('ACCOUNT_CHANGED_DURING_LINK');
    expect(cancelAuthTransaction).toHaveBeenCalledWith('tx-1');
  });

  it('verifyEmailAuthCode uses signup OTP type for signup-marked transactions', async () => {
    getAuthTransaction.mockResolvedValue({ ...transaction, confirmation: 'signup', intent: 'sign_up' });
    await verifyEmailAuthCode({ code: '123456', email: 'user@example.com', transactionId: 'tx-1' });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'signup',
    });
  });
});
