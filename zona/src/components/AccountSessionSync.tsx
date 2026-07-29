import { useEffect } from 'react';
import { Platform } from 'react-native';

import { bindCurrentInstallation } from '@/data/account';
import { useAuth } from '@/providers/AuthProvider';

export function AccountSessionSync() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;

  useEffect(() => {
    if (!accessToken || !userId || Platform.OS === 'web') return;
    let active = true;
    void bindCurrentInstallation(userId).catch((error) => {
      if (active) console.warn('Could not bind this Zona installation to the current session.', error);
    });
    return () => { active = false; };
  }, [accessToken, userId]);

  return null;
}
