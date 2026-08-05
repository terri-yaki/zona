import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Provider, Session } from '@supabase/supabase-js';

import { translate } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { parseAuthCallbackUrl, assertSameUserUpgrade, type AuthCallbackParams } from './auth-callback';
import {
  beginAuthTransaction,
  cancelAuthTransaction,
  consumeAuthTransaction,
  getAuthTransaction,
  type AuthIntent,
  type AuthProviderName,
  type AuthTransaction,
} from './auth-transactions';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

function callbackUrl(transactionId: string) {
  return Linking.createURL('auth/callback', { queryParams: { zona_tx: transactionId } });
}

export function normalizeAuthEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 254) throw new Error('INVALID_EMAIL');
  return value;
}

const codedAuthErrorKeys: Record<string, TranslationKey> = {
  EMAIL_IN_USE: 'auth.emailInUse',
  INVALID_EMAIL: 'auth.emailInvalid',
};

// GoTrue answers password sign-in failures with raw English messages; map the
// non-enumerating ones to localized copy so the UI never shows raw server text.
const supabaseAuthMessageKeys: Record<string, TranslationKey> = {
  'Email not confirmed': 'auth.emailNotConfirmed',
  'Invalid login credentials': 'auth.passwordInvalid',
};

export function describeAuthError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const key = codedAuthErrorKeys[error.message] ?? supabaseAuthMessageKeys[error.message];
    if (key) return translate(key);
    return error.message;
  }
  return fallback;
}

export async function startEmailAuth(email: string, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) {
  const normalized = normalizeAuthEmail(email);
  const { data: sessionData } = await supabase.auth.getSession();
  const expectedUserId = intent === 'protect_guest' || intent === 'link_method' ? sessionData.session?.user.id ?? null : null;
  if ((intent === 'protect_guest' || intent === 'link_method') && !expectedUserId) throw new Error('UNAUTHORIZED');
  const transaction = await beginAuthTransaction({
    email: normalized,
    expectedUserId,
    intent,
    provider: 'email',
  });
  const redirectTo = callbackUrl(transaction.id);
  const result = intent === 'protect_guest' || intent === 'link_method'
    ? await supabase.auth.updateUser({ email: normalized }, { emailRedirectTo: redirectTo })
    : await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: intent === 'sign_up' },
      });
  if (result.error) {
    await cancelAuthTransaction(transaction.id);
    throw result.error;
  }
  return transaction;
}

export async function startPasswordAuth(
  email: string,
  password: string,
  intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>,
): Promise<Session | AuthTransaction> {
  const normalized = normalizeAuthEmail(email);
  const { data: sessionData } = await supabase.auth.getSession();
  const expectedUserId = intent === 'protect_guest' || intent === 'link_method'
    ? sessionData.session?.user.id ?? null
    : null;
  if ((intent === 'protect_guest' || intent === 'link_method') && !expectedUserId) throw new Error('UNAUTHORIZED');

  if (intent === 'sign_in') {
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error) throw error;
    if (!data.session) throw new Error('UNAUTHORIZED');
    return data.session;
  }

  const transaction = await beginAuthTransaction({
    confirmation: intent === 'sign_up' ? 'signup' : undefined,
    email: normalized,
    expectedUserId,
    intent,
    provider: 'email',
  });

  if (intent === 'sign_up') {
    const { data, error } = await supabase.auth.signUp({ email: normalized, password });
    if (error) {
      await cancelAuthTransaction(transaction.id);
      throw error;
    }
    if (data.session) {
      await consumeAuthTransaction(transaction.id);
      return data.session;
    }
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      // Supabase answers a duplicate sign-up non-enumerating: a user object
      // with no identities, no session, and no error. No confirmation code is
      // sent, so routing to check-email would dead-end; fail with a coded
      // error the UI can translate into "sign in instead".
      await cancelAuthTransaction(transaction.id);
      throw new Error(data.user ? 'EMAIL_IN_USE' : 'UNAUTHORIZED');
    }
    return transaction;
  }

  const { data, error } = await supabase.auth.updateUser({ email: normalized, password });
  if (error) {
    await cancelAuthTransaction(transaction.id);
    throw error;
  }
  if (data.user?.new_email) {
    return transaction;
  }
  const { data: verified, error: userError } = await supabase.auth.getUser();
  if (userError || !verified.user) {
    await cancelAuthTransaction(transaction.id);
    throw userError ?? new Error('UNAUTHORIZED');
  }
  try {
    assertSameUserUpgrade(intent, expectedUserId, verified.user.id);
  } catch (error) {
    await cancelAuthTransaction(transaction.id);
    throw error;
  }
  // updateUser rewrites the stored session; re-read it so callers receive the
  // user object carrying the freshly linked email/password identity instead
  // of the stale pre-update snapshot.
  const { data: linked } = await supabase.auth.getSession();
  if (!linked.session) {
    await cancelAuthTransaction(transaction.id);
    throw new Error('UNAUTHORIZED');
  }
  await consumeAuthTransaction(transaction.id);
  return linked.session;
}

export async function verifyEmailAuthCode(input: {
  code: string;
  email: string;
  transactionId: string;
}) {
  const transaction = await getAuthTransaction(input.transactionId);
  if (!transaction || transaction.provider !== 'email') throw new Error('AUTH_TRANSACTION_EXPIRED');
  const normalizedEmail = normalizeAuthEmail(input.email);
  if (!transaction.email || normalizedEmail !== transaction.email) throw new Error('AUTH_TRANSACTION_MISMATCH');
  const type = transaction.confirmation === 'signup'
    ? 'signup'
    : transaction.intent === 'protect_guest' || transaction.intent === 'link_method'
      ? 'email_change'
      : 'email';
  const { data, error } = await supabase.auth.verifyOtp({
    email: transaction.email,
    token: input.code.trim(),
    type,
  });
  if (error) throw error;
  if (!data.user) throw new Error('UNAUTHORIZED');
  assertSameUserUpgrade(transaction.intent, transaction.expectedUserId, data.user.id);
  await consumeAuthTransaction(transaction.id);
  return data.user;
}

export async function resendEmailVerification(email: string, transactionId: string): Promise<AuthTransaction> {
  const existing = await getAuthTransaction(transactionId);
  if (!existing) throw new Error('AUTH_TRANSACTION_EXPIRED');
  if (existing.confirmation === 'signup') {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    return beginAuthTransaction({
      confirmation: 'signup',
      email: existing.email ?? email,
      expectedUserId: existing.expectedUserId,
      intent: 'sign_up',
      provider: 'email',
    });
  }
  if (existing.intent === 'protect_guest' || existing.intent === 'link_method') {
    const { error } = await supabase.auth.resend({ type: 'email_change', email });
    if (error) throw error;
    return beginAuthTransaction({
      email: existing.email ?? email,
      expectedUserId: existing.expectedUserId,
      intent: existing.intent,
      provider: 'email',
    });
  }
  throw new Error('AUTH_TRANSACTION_MISMATCH');
}

export async function resendSignupConfirmation(email: string): Promise<AuthTransaction> {
  const normalized = normalizeAuthEmail(email);
  const { error } = await supabase.auth.resend({ type: 'signup', email: normalized });
  if (error) throw error;
  return beginAuthTransaction({
    confirmation: 'signup',
    email: normalized,
    expectedUserId: null,
    intent: 'sign_up',
    provider: 'email',
  });
}

export async function startProviderAuth(provider: AuthProviderName, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const expectedUserId = intent === 'protect_guest' || intent === 'link_method'
    ? sessionData.session?.user.id ?? null
    : null;
  if ((intent === 'protect_guest' || intent === 'link_method') && !expectedUserId) throw new Error('UNAUTHORIZED');
  const transaction = await beginAuthTransaction({ expectedUserId, intent, provider });
  const options = { redirectTo: callbackUrl(transaction.id), skipBrowserRedirect: true };
  const response = intent === 'protect_guest' || intent === 'link_method'
    ? await supabase.auth.linkIdentity({ provider: provider as Provider, options })
    : await supabase.auth.signInWithOAuth({ provider: provider as Provider, options });
  if (response.error || !response.data.url) {
    await cancelAuthTransaction(transaction.id);
    throw response.error ?? new Error('AUTH_PROVIDER_UNAVAILABLE');
  }
  const browserResult = await WebBrowser.openAuthSessionAsync(response.data.url, options.redirectTo);
  if (browserResult.type !== 'success' || !browserResult.url) {
    await cancelAuthTransaction(transaction.id);
    if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') return null;
    throw new Error('AUTH_PROVIDER_UNAVAILABLE');
  }
  return completeAuthCallback(parseAuthCallbackUrl(browserResult.url));
}

export async function completeAuthCallback(params: AuthCallbackParams) {
  if (params.error) throw new Error(params.errorDescription || params.error);
  if (!params.transactionId) throw new Error('AUTH_TRANSACTION_MISSING');
  const transaction = await getAuthTransaction(params.transactionId);
  if (!transaction) throw new Error('AUTH_TRANSACTION_EXPIRED');

  let userId: string | null = null;
  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    userId = data.user?.id ?? data.session?.user.id ?? null;
  } else if (params.tokenHash && params.type) {
    if (transaction.provider !== 'email') throw new Error('AUTH_TRANSACTION_MISMATCH');
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.type,
    });
    if (error) throw error;
    userId = data.user?.id ?? data.session?.user.id ?? null;
  } else {
    throw new Error('AUTH_CALLBACK_INVALID');
  }
  if (!userId) throw new Error('UNAUTHORIZED');
  assertSameUserUpgrade(transaction.intent, transaction.expectedUserId, userId);
  const { data: verified, error: userError } = await supabase.auth.getUser();
  if (userError || verified.user?.id !== userId) throw userError ?? new Error('UNAUTHORIZED');
  await consumeAuthTransaction(transaction.id);
  return { intent: transaction.intent, user: verified.user };
}
