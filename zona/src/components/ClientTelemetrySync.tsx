import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { recordClientErrorOnce, recordClientEvent } from '@/lib/client-telemetry';
import { useAuth } from '@/providers/AuthProvider';

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler(): GlobalErrorHandler;
    setGlobalHandler(handler: GlobalErrorHandler): void;
  };
};

export function ClientTelemetrySync() {
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading || !session) return;
    recordClientEvent('app.session_ready', 'info', { anonymous: session.user.is_anonymous === true });

    const onState = (state: AppStateStatus) => {
      recordClientEvent('app.state_changed', 'info', { state });
    };
    const subscription = AppState.addEventListener('change', onState);
    return () => subscription.remove();
  }, [loading, session]);

  useEffect(() => {
    const errorUtils = (globalThis as GlobalWithErrorUtils).ErrorUtils;
    if (!errorUtils) return;
    const previous = errorUtils.getGlobalHandler();
    const handler: GlobalErrorHandler = (error, isFatal) => {
      recordClientErrorOnce('app.uncaught_error', error, { fatal: isFatal === true });
      previous(error, isFatal);
    };
    errorUtils.setGlobalHandler(handler);
    return () => errorUtils.setGlobalHandler(previous);
  }, []);

  return null;
}
