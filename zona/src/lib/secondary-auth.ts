import { createClient, type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { env } from './env';

export type SecondaryProvider = 'apple' | 'github' | 'google';

export function createSecondaryAuthClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: false,
    },
  });
}

export function normalizeSecondaryEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 254) throw new Error('INVALID_EMAIL');
  return value;
}

export async function sendSecondaryEmailCode(email: string) {
  const client = createSecondaryAuthClient();
  const normalized = normalizeSecondaryEmail(email);
  const { error } = await client.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return { client, email: normalized };
}

export async function verifySecondaryEmailCode(
  client: ReturnType<typeof createSecondaryAuthClient>,
  email: string,
  code: string,
) {
  const { data, error } = await client.auth.verifyOtp({
    email: normalizeSecondaryEmail(email),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
  if (!data.session) throw new Error('FRESH_PROOF_REQUIRED');
  return data.session;
}

export async function authenticateSecondaryProvider(provider: SecondaryProvider) {
  const client = createSecondaryAuthClient();
  const redirectTo = Linking.createURL('auth/reauth');
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error('AUTH_PROVIDER_UNAVAILABLE');
  const browser = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (browser.type !== 'success' || !browser.url) {
    if (browser.type === 'cancel' || browser.type === 'dismiss') return null;
    throw new Error('AUTH_PROVIDER_UNAVAILABLE');
  }
  const parsed = Linking.parse(browser.url);
  const codeValue = parsed.queryParams?.code;
  const code = Array.isArray(codeValue) ? codeValue[0] : codeValue;
  if (typeof code !== 'string') throw new Error('AUTH_CALLBACK_INVALID');
  const { data: exchanged, error: exchangeError } = await client.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  if (!exchanged.session) throw new Error('FRESH_PROOF_REQUIRED');
  return exchanged.session;
}

export async function releaseSecondarySession(session: Session | null) {
  if (!session) return;
  const client = createSecondaryAuthClient();
  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
