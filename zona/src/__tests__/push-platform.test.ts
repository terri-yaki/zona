import { describe, expect, it } from 'vitest';

import { en } from '../i18n/en';
import { isAndroidPushConfigurationError, nativePushPlatform, relayStatusLabelKey, type RelayHealthStatus } from '../lib/push-platform';

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

  it('labels an unchecked relay as not checked', () => {
    expect(relayStatusLabelKey(null)).toBe('settings.relay.notChecked');
  });

  it('labels a failed relay check as needing attention without exposing error text', () => {
    expect(relayStatusLabelKey('error')).toBe('settings.relay.error');
    expect(relayStatusLabelKey('error')).not.toBe('settings.relay.notChecked');
  });

  it('maps camel-case exceptions and passes the remaining statuses through', () => {
    expect(relayStatusLabelKey('not-granted')).toBe('settings.relay.notGranted');
    expect(relayStatusLabelKey('expo-go')).toBe('settings.relay.expoGo');
    expect(relayStatusLabelKey('registered')).toBe('settings.relay.registered');
    expect(relayStatusLabelKey('unregistered')).toBe('settings.relay.unregistered');
  });

  it('only produces keys that exist in the catalog', () => {
    const statuses: (RelayHealthStatus | null)[] = [
      null,
      'registered',
      'not-granted',
      'denied',
      'simulator',
      'expo-go',
      'web',
      'android-unconfigured',
      'unregistered',
      'error',
    ];
    for (const status of statuses) {
      expect(en[relayStatusLabelKey(status) as keyof typeof en], relayStatusLabelKey(status)).toBeDefined();
    }
  });
});
