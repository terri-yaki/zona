import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { addPushRegistrationRefreshListener, syncPushRegistration } from '@/lib/push';
import { useAuth } from '@/providers/AuthProvider';

/** Cool-down after a failed Expo token fetch so tunnel/dev network issues don't spam. */
const MIN_SYNC_INTERVAL_MS = 90_000;

export function PushRegistrationSync() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const lastAttemptAt = useRef(0);
  const inFlight = useRef(false);
  const failureCount = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const sync = () => {
      const now = Date.now();
      if (inFlight.current) return;
      if (failureCount.current > 0 && now - lastAttemptAt.current < MIN_SYNC_INTERVAL_MS) return;

      lastAttemptAt.current = now;
      inFlight.current = true;
      void syncPushRegistration(userId)
        .then(() => {
          failureCount.current = 0;
        })
        .catch((error) => {
          failureCount.current += 1;
          if (failureCount.current <= 2) {
            console.warn('Could not refresh this installation push registration.', error);
          }
        })
        .finally(() => {
          inFlight.current = false;
        });
    };

    sync();
    const tokenSubscription = addPushRegistrationRefreshListener(userId);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [userId]);

  return null;
}
