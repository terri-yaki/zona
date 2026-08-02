import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  currentAppVersion,
  DELIVERY_STATUS_MIN_APP_VERSION,
  deliveryStatusVisible,
  deliveryStatusVisibleForVersion,
  versionAtLeast,
} from '../lib/app-version';

// Mutable expoConfig stub: currentAppVersion() reads it lazily per call, so
// tests can simulate installed app versions. vi.mock/vi.hoisted are hoisted
// above the imports by vitest, so the stub is in place before app-version loads.
const expoConfig = vi.hoisted(() => ({ version: '0.0.10' as string | undefined }));

vi.mock('expo-constants', () => ({
  default: { expoConfig },
}));

beforeEach(() => {
  expoConfig.version = '0.0.10';
});

describe('currentAppVersion', () => {
  it('reads the version from the Expo config', () => {
    expoConfig.version = '0.0.11';
    expect(currentAppVersion()).toBe('0.0.11');
  });

  it('falls back to 0.0.0 when the config carries no version', () => {
    expoConfig.version = undefined;
    expect(currentAppVersion()).toBe('0.0.0');
  });
});

describe('versionAtLeast', () => {
  it('passes equal and newer versions, including higher minor and major', () => {
    expect(versionAtLeast('0.0.10', '0.0.10')).toBe(true);
    expect(versionAtLeast('0.0.11', '0.0.10')).toBe(true);
    expect(versionAtLeast('0.1.0', '0.0.10')).toBe(true);
    expect(versionAtLeast('1.0.0', '0.0.10')).toBe(true);
  });

  it('rejects older versions', () => {
    expect(versionAtLeast('0.0.9', '0.0.10')).toBe(false);
    expect(versionAtLeast('0.0.0', '0.0.10')).toBe(false);
  });

  it('compares numerically, not lexicographically', () => {
    // '9' > '1' as a string; as numbers 9 < 10.
    expect(versionAtLeast('0.0.9', '0.0.10')).toBe(false);
    expect(versionAtLeast('0.0.10', '0.0.9')).toBe(true);
  });

  it('treats missing segments as zero', () => {
    expect(versionAtLeast('0.0', '0.0.10')).toBe(false);
    expect(versionAtLeast('1.0', '0.0.10')).toBe(true);
  });

  it('rejects unparseable input', () => {
    for (const version of ['', 'garbage', '0.0.x', 'v0.0.11', '0.0.10-beta']) {
      expect(versionAtLeast(version, '0.0.10'), version).toBe(false);
    }
  });
});

describe('deliveryStatusVisibleForVersion', () => {
  it('floors delivery status at v0.0.10', () => {
    expect(DELIVERY_STATUS_MIN_APP_VERSION).toBe('0.0.10');
    expect(deliveryStatusVisibleForVersion('0.0.10')).toBe(true);
  });

  it('keeps delivery status visible on newer versions', () => {
    for (const version of ['0.0.11', '0.1.0', '1.0.0']) {
      expect(deliveryStatusVisibleForVersion(version), version).toBe(true);
    }
  });

  it('hides delivery status on older or invalid versions', () => {
    for (const version of ['0.0.9', '0.0.8', '0.0.0', '']) {
      expect(deliveryStatusVisibleForVersion(version), version).toBe(false);
    }
  });
});

describe('deliveryStatusVisible', () => {
  it('is visible for an installed v0.0.10 binary', () => {
    expoConfig.version = '0.0.10';
    expect(deliveryStatusVisible()).toBe(true);
  });

  it('stays visible for an installed v0.0.11 binary', () => {
    expoConfig.version = '0.0.11';
    expect(deliveryStatusVisible()).toBe(true);
  });

  it('is hidden for an installed pre-0.0.10 binary', () => {
    expoConfig.version = '0.0.9';
    expect(deliveryStatusVisible()).toBe(false);
  });
});

describe('shipped version', () => {
  it('app.json is at or past v0.0.10, so this build shows delivery status', () => {
    const appJsonPath = fileURLToPath(new URL('../../app.json', import.meta.url));
    const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')) as { expo?: { version?: string } };
    const version = appJson.expo?.version ?? '';
    expect(version).not.toBe('');
    expect(deliveryStatusVisibleForVersion(version)).toBe(true);
  });
});
