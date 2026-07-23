import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true, authError: null, clearAuthError() {} });

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);

  useEffect(() => {
    let active = true;

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
    });
    const appStateSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) setAuthError('Your saved session could not be restored. Sign in again.');
        setSession(data.session);
        if (Platform.OS !== 'web' && AppState.currentState === 'active') supabase.auth.startAutoRefresh();
      } catch {
        if (active) setAuthError('Zona could not restore your session. Check your connection and try again.');
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
  }, []);

  const value = useMemo(() => ({ session, loading, authError, clearAuthError }), [authError, clearAuthError, loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
