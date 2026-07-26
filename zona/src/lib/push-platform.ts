export type NativePushPlatform = 'android' | 'ios';

export function nativePushPlatform(os: string): NativePushPlatform | null {
  return os === 'android' || os === 'ios' ? os : null;
}

export function isAndroidFirebaseConfigurationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Firebase Messaging instance|Default FirebaseApp is not initialized|googleServicesFile|FirebaseApp\.initializeApp/i.test(message);
}
