import { useEffect } from 'react';

import { bindCurrentInstallation } from '@/data/account';
import { useAuth } from '@/providers/AuthProvider';

export function AccountSessionSync() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;

  // Bind on every platform, including web: protect_guest/link_method require an
  // active installation_sessions row, which is never created if web skips this.
  useEffect(() => {
    if (!accessToken || !userId) return;
    let active = true;
    void bindCurrentInstallation(userId).catch((error) => {
      if (active) console.warn('Could not bind this Zona installation to the current session.', error);
    });
    return () => { active = false; };
  }, [accessToken, userId]);

  return null;
}
