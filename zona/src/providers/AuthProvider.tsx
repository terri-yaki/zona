import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { clearPrivateUserState } from '@/cache/private-state';
import { startEmailAuth, startPasswordAuth, startProviderAuth, verifyEmailAuthCode } from '@/lib/auth-flow';
import type { AuthIntent, AuthProviderName } from '@/lib/auth-transactions';
import { supabase } from '@/lib/supabase';
import { translate } from '@/i18n';

type AuthState = {
  session: Session | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  continueAsGuest: () => Promise<void>;
  refreshSession: () => Promise<void>;
  sendEmailAuth: (email: string, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) => ReturnType<typeof startEmailAuth>;
  startPasswordAuth: (email: string, password: string, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) => ReturnType<typeof startPasswordAuth>;
  startProvider: (provider: AuthProviderName, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) => ReturnType<typeof startProviderAuth>;
  verifyEmailCode: typeof verifyEmailAuthCode;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const activeUserId = useRef<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);
  const applySession = useCallback((nextSession: Session | null) => {
    const previousUserId = activeUserId.current;
    const nextUserId = nextSession?.user.id ?? null;
    activeUserId.current = nextUserId;
    setSession(nextSession);
    if (previousUserId && previousUserId !== nextUserId) {
      void clearPrivateUserState(previousUserId).catch((error) => {
        console.warn('Could not clear the previous account cache.', error);
      });
    }
  }, []);

  const continueAsGuest = useCallback(async () => {
    clearAuthError();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }, [clearAuthError]);

  const refreshSession = useCallback(async () => {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    applySession(refreshed.session);
  }, [applySession]);

  const sendEmailAuth = useCallback((email: string, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) => (
    startEmailAuth(email, intent)
  ), []);

  const startPasswordAuthCb = useCallback((email: string, password: string, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) => (
    startPasswordAuth(email, password, intent)
  ), []);

  const startProvider = useCallback((provider: AuthProviderName, intent: Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'>) => (
    startProviderAuth(provider, intent)
  ), []);

  // verifyOtp already persists the session and fires onAuthStateChange (which
  // applies it); an extra refreshSession here would only add a redundant
  // token-refresh round trip to every OTP verification.
  const verifyEmailCode = useCallback((input: Parameters<typeof verifyEmailAuthCode>[0]) => (
    verifyEmailAuthCode(input)
  ), []);

  useEffect(() => {
    let active = true;

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      applySession(nextSession);
    });
    const appStateSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) setAuthError(translate('error.UNAUTHORIZED'));
        applySession(data.session);
        if (Platform.OS !== 'web' && AppState.currentState === 'active') supabase.auth.startAutoRefresh();
      } catch {
        if (active) setAuthError(translate('error.connection'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      authSubscription.subscription.unsubscribe();
      appStateSubscription?.remove();
      if (Platform.OS !== 'web') supabase.auth.stopAutoRefresh();
    };
  }, [applySession]);

  const value = useMemo(() => ({
    session,
    loading,
    authError,
    clearAuthError,
    continueAsGuest,
    refreshSession,
    sendEmailAuth,
    startPasswordAuth: startPasswordAuthCb,
    startProvider,
    verifyEmailCode,
  }), [authError, clearAuthError, continueAsGuest, loading, refreshSession, sendEmailAuth, session, startPasswordAuthCb, startProvider, verifyEmailCode]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
