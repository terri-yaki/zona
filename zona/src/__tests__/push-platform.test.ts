import { describe, expect, it } from 'vitest';

import { isAndroidFirebaseConfigurationError, nativePushPlatform } from '../lib/push-platform';

describe('push platform helpers', () => {
  it('allows only native platforms supported by the relay', () => {
    expect(nativePushPlatform('ios')).toBe('ios');
    expect(nativePushPlatform('android')).toBe('android');
    expect(nativePushPlatform('web')).toBeNull();
  });

  it('recognizes missing Android Firebase configuration', () => {
    expect(isAndroidFirebaseConfigurationError(new Error('Default FirebaseApp is not initialized in this process'))).toBe(true);
    expect(isAndroidFirebaseConfigurationError(new Error('Unable to get Firebase Messaging instance'))).toBe(true);
    expect(isAndroidFirebaseConfigurationError(new Error('Network request failed'))).toBe(false);
  });
});
