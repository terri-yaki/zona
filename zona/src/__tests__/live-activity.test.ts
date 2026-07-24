import { beforeEach, describe, expect, it } from 'vitest';

import { relativeTimeShort } from '../lib/format';
import {
  buildLiveActivityConfig,
  buildLiveActivityState,
  LIVE_ACTIVITY_COLORS,
  LIVE_ACTIVITY_SYMBOL,
  type ZonaLiveActivitySnapshot,
} from '../lib/live-activity-presentation';
import { setActiveLanguage } from '../i18n';

beforeEach(() => setActiveLanguage('en'));

function snapshot(overrides: Partial<ZonaLiveActivitySnapshot> = {}): ZonaLiveActivitySnapshot {
  return {
    unreadCount: 3,
    latestTitle: 'Deploy failed on OFFICE-01',
    latestSource: 'Office PC',
    latestId: '550e8400-e29b-41d4-a716-446655440000',
    latestCreatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    ...overrides,
  };
}

describe('buildLiveActivityState', () => {
  it('leads the title with the unread count', () => {
    const state = buildLiveActivityState(snapshot());
    expect(state.title).toBe('3 unread · Deploy failed on OFFICE-01');
  });

  it('puts source and compact recency in the subtitle', () => {
    const state = buildLiveActivityState(snapshot());
    expect(state.subtitle).toBe('Office PC · updated 10m');
  });

  it('falls back to a waiting label when no latest title exists', () => {
    expect(buildLiveActivityState(snapshot({ latestTitle: null })).title).toBe('3 waiting');
    expect(buildLiveActivityState(snapshot({ latestTitle: null, unreadCount: 1 })).title).toBe(
      '1 waiting',
    );
  });

  it('falls back to Zona as the source and omits missing recency', () => {
    const state = buildLiveActivityState(snapshot({ latestSource: null, latestCreatedAt: null }));
    expect(state.subtitle).toBe('Zona');
  });

  it('truncates titles to 80 characters', () => {
    const state = buildLiveActivityState(snapshot({ latestTitle: 'x'.repeat(200) }));
    expect(state.title).toHaveLength(80);
  });

  it('uses the active app language without translating sender content', () => {
    setActiveLanguage('zh-Hant');
    const state = buildLiveActivityState(snapshot());
    expect(state.title).toBe('3 則未讀 · Deploy failed on OFFICE-01');
    expect(state.subtitle).toBe('Office PC · 10分鐘更新');
  });

  it('never renders a session-timer progress bar', () => {
    const state = buildLiveActivityState(snapshot());
    expect(state).not.toHaveProperty('progressBar');
  });

  it('uses the native white bell symbol instead of a bundled app image', () => {
    const state = buildLiveActivityState(snapshot());
    expect(state.imageName).toBe(LIVE_ACTIVITY_SYMBOL);
    expect(state.dynamicIslandImageName).toBe(LIVE_ACTIVITY_SYMBOL);
    expect(LIVE_ACTIVITY_SYMBOL).toBe('sf:bell.badge.fill');
  });
});

describe('buildLiveActivityConfig', () => {
  it('uses the Zona brand surface and readable text colors', () => {
    const config = buildLiveActivityConfig(snapshot());
    expect(config.backgroundColor).toBe(LIVE_ACTIVITY_COLORS.background);
    expect(config.titleColor).toBe(LIVE_ACTIVITY_COLORS.title);
    expect(config.subtitleColor).toBe(LIVE_ACTIVITY_COLORS.subtitle);
  });

  it('locks the palette to the theme primary family (update on rebrand only)', () => {
    // Mirrors theme primaryDark / white / primarySoft.
    expect(LIVE_ACTIVITY_COLORS).toEqual({
      background: '#25564C',
      title: '#FFFFFF',
      subtitle: '#DDECE6',
    });
  });

  it('deep-links to the latest notification and falls back to the inbox', () => {
    expect(buildLiveActivityConfig(snapshot()).deepLinkUrl).toBe(
      '/notification/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(buildLiveActivityConfig(snapshot({ latestId: null })).deepLinkUrl).toBe('/');
  });
});

describe('relativeTimeShort', () => {
  it('formats compact buckets', () => {
    const now = Date.now();
    expect(relativeTimeShort(new Date(now - 20_000).toISOString())).toBe('now');
    expect(relativeTimeShort(new Date(now - 10 * 60_000).toISOString())).toBe('10m');
    expect(relativeTimeShort(new Date(now - 5 * 3_600_000).toISOString())).toBe('5h');
    expect(relativeTimeShort(new Date(now - 3 * 86_400_000).toISOString())).toBe('3d');
  });

  it('returns an empty string for unparseable input', () => {
    expect(relativeTimeShort('not-a-date')).toBe('');
  });
});
