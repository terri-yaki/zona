import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Provider } from '@supabase/supabase-js';

import { parseAuthCallbackUrl, assertSameUserUpgrade, type AuthCallbackParams } from './auth-callback';
import {
  beginAuthTransaction,
  cancelAuthTransaction,
  consumeAuthTransaction,
  getAuthTransaction,
  type AuthIntent,
  type AuthProviderName,
} from './auth-transactions';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

function callbackUrl(transactionId: string) {
  return Linking.createURL('auth/callback', { queryParams: { zona_tx: transactionId } });
}

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 254) throw new Error('INVALID_EMAIL');
  return value;
}

export async function startEmailAuth(email: string, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) {
  const normalized = normalizeEmail(email);
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

export async function verifyEmailAuthCode(input: {
  code: string;
  email: string;
  transactionId: string;
}) {
  const transaction = await getAuthTransaction(input.transactionId);
  if (!transaction || transaction.provider !== 'email') throw new Error('AUTH_TRANSACTION_EXPIRED');
  const normalizedEmail = normalizeEmail(input.email);
  if (!transaction.email || normalizedEmail !== transaction.email) throw new Error('AUTH_TRANSACTION_MISMATCH');
  const type = transaction.intent === 'protect_guest' || transaction.intent === 'link_method' ? 'email_change' : 'email';
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
