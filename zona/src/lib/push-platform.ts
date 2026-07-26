export type NativePushPlatform = 'android' | 'ios';

export function nativePushPlatform(os: string): NativePushPlatform | null {
  return os === 'android' || os === 'ios' ? os : null;
}

export function isAndroidPushConfigurationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Messaging instance|Default .*App is not initialized|googleServicesFile|App\.initializeApp/i.test(message);
}
