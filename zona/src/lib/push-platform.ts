export type NativePushPlatform = 'android' | 'ios';

export function nativePushPlatform(os: string): NativePushPlatform | null {
  return os === 'android' || os === 'ios' ? os : null;
}

export function isAndroidPushConfigurationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Messaging instance|Default .*App is not initialized|googleServicesFile|App\.initializeApp/i.test(message);
}

export type RelayHealthStatus = 'registered' | 'not-granted' | 'denied' | 'simulator' | 'expo-go' | 'web' | 'android-unconfigured' | 'unregistered' | 'error';

const relayLabelKeys = {
  registered: 'settings.relay.registered',
  'not-granted': 'settings.relay.notGranted',
  denied: 'settings.relay.denied',
  simulator: 'settings.relay.simulator',
  'expo-go': 'settings.relay.expoGo',
  web: 'settings.relay.web',
  'android-unconfigured': 'settings.relay.android-unconfigured',
  unregistered: 'settings.relay.unregistered',
  error: 'settings.relay.error',
} as const;

export type RelayStatusLabelKey = typeof relayLabelKeys[RelayHealthStatus] | 'settings.relay.notChecked';

/**
 * Catalog key for the Settings "Zona relay" row. A failed health check maps
 * to the generic 'Needs attention' label — the raw error text is never shown.
 */
export function relayStatusLabelKey(status: RelayHealthStatus | null): RelayStatusLabelKey {
  if (!status) return 'settings.relay.notChecked';
  return relayLabelKeys[status];
}
