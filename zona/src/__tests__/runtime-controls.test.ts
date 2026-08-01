import { describe, expect, it } from 'vitest';

import {
  defaultRuntimeSnapshot,
  featureEnabled,
  featureVisible,
  parseRuntimeSnapshot,
  runtimeBoolean,
  runtimeChoice,
  runtimeNumber,
  runtimeString,
} from '../lib/runtime-controls';

describe('parseRuntimeSnapshot', () => {
  it('accepts only compiled feature keys and valid modes', () => {
    const snapshot = parseRuntimeSnapshot({
      features: {
        'sources.create': { mode: 'disabled', reason: 'Maintenance' },
        'settings.sound': { mode: 'invented' },
        'arbitrary.remote.component': { mode: 'enabled' },
      },
    });

    expect(featureVisible(snapshot, 'sources.create')).toBe(true);
    expect(featureEnabled(snapshot, 'sources.create')).toBe(false);
    expect(snapshot.features['sources.create'].reason).toBe('Maintenance');
    expect(snapshot.features['settings.sound'].mode).toBe('enabled');
    expect(snapshot.features).not.toHaveProperty('arbitrary.remote.component');
  });

  it('keeps safe typed defaults for invalid limits and settings', () => {
    const snapshot = parseRuntimeSnapshot({
      refreshAfterSeconds: 2,
      settings: { count: 'not-a-number', url: 4 },
      limits: { retentionDays: -10, maxAttachmentBytes: 999_999_999 },
    });

    expect(snapshot.refreshAfterSeconds).toBe(60);
    expect(snapshot.limits.retentionDays).toBe(1);
    expect(snapshot.limits.maxAttachmentBytes).toBe(52_428_800);
    expect(runtimeNumber(snapshot, 'count', 12)).toBe(12);
    expect(runtimeString(snapshot, 'url', 'fallback')).toBe('fallback');
  });

  it('does not mutate the compiled fallback snapshot', () => {
    const parsed = parseRuntimeSnapshot({ features: { 'inbox.filters': { mode: 'hidden' } } });
    expect(parsed.features['inbox.filters'].mode).toBe('hidden');
    expect(defaultRuntimeSnapshot.features['inbox.filters'].mode).toBe('enabled');
  });

  it('reads only valid boolean and allowlisted choice settings', () => {
    const snapshot = parseRuntimeSnapshot({ settings: { enabled: true, density: 'compact', invented: 'spacious' } });
    expect(runtimeBoolean(snapshot, 'enabled', false)).toBe(true);
    expect(runtimeBoolean(snapshot, 'missing', false)).toBe(false);
    expect(runtimeChoice(snapshot, 'density', ['comfortable', 'compact'] as const, 'comfortable')).toBe('compact');
    expect(runtimeChoice(snapshot, 'invented', ['comfortable', 'compact'] as const, 'comfortable')).toBe('comfortable');
  });

  it('parses localized release policy and safe announcements', () => {
    const snapshot = parseRuntimeSnapshot({
      releasePolicy: {
        minimum_build_number: 12,
        recommended_build_number: 15,
        latest_build_number: 18,
        update_mode: 'hard',
        maintenance_mode: true,
        message: '請更新 Zona。',
        store_url: 'https://apps.apple.com/app/id0000000000',
      },
      announcements: [
        { id: 'one', key: 'maintenance', title: 'Heads up', body: 'Short pause', tone: 'warning', isDismissible: false },
        { id: 'two', key: 'invalid', title: 'No tone', body: 'Ignored', tone: 'unknown' },
      ],
    });

    expect(snapshot.releasePolicy).toEqual({
      minimumBuildNumber: 12,
      recommendedBuildNumber: 15,
      latestBuildNumber: 18,
      updateMode: 'hard',
      maintenanceMode: true,
      message: '請更新 Zona。',
      storeUrl: 'https://apps.apple.com/app/id0000000000',
    });
    expect(snapshot.announcements).toHaveLength(1);
    expect(snapshot.announcements[0].isDismissible).toBe(false);
  });
});
