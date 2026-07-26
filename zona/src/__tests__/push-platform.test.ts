import { describe, expect, it } from 'vitest';

import { isAndroidPushConfigurationError, nativePushPlatform } from '../lib/push-platform';

describe('push platform helpers', () => {
  it('allows only native platforms supported by the relay', () => {
    expect(nativePushPlatform('ios')).toBe('ios');
    expect(nativePushPlatform('android')).toBe('android');
    expect(nativePushPlatform('web')).toBeNull();
  });

  it('recognizes missing Android push configuration', () => {
    expect(isAndroidPushConfigurationError(new Error('Default push App is not initialized in this process'))).toBe(true);
    expect(isAndroidPushConfigurationError(new Error('Unable to get Messaging instance'))).toBe(true);
    expect(isAndroidPushConfigurationError(new Error('Network request failed'))).toBe(false);
  });
});
