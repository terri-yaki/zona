import { useEffect } from 'react';
import { AppState } from 'react-native';

import { addPushRegistrationRefreshListener, syncPushRegistration } from '@/lib/push';
import { useAuth } from '@/providers/AuthProvider';

export function PushRegistrationSync() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    const sync = () => void syncPushRegistration(userId).catch((error) => {
      console.warn('Could not refresh this installation push registration.', error);
    });
    sync();
    const tokenSubscription = addPushRegistrationRefreshListener(userId, (error) => {
      console.warn('Could not update a changed push token.', error);
    });
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
