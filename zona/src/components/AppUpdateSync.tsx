import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { promptForAppUpdateIfAvailable, updatesEnabled } from '@/lib/app-updates';

const RESUME_CHECK_COOLDOWN_MS = 15 * 60 * 1_000;

/**
 * Checks Expo OTA on cold start and (throttled) when returning to foreground.
 * No-ops in __DEV__ / when expo-updates is disabled.
 */
export function AppUpdateSync() {
  const lastResumeCheck = useRef(0);

  useEffect(() => {
    if (!updatesEnabled()) return;

    void promptForAppUpdateIfAvailable({ silentWhenCurrent: true });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastResumeCheck.current < RESUME_CHECK_COOLDOWN_MS) return;
      lastResumeCheck.current = now;
      void promptForAppUpdateIfAvailable({ silentWhenCurrent: true });
    });

    return () => subscription.remove();
  }, []);

  return null;
}
