import { relativeTimeShort } from './format';
import { translate, translateCount } from '../i18n';

/**
 * Presentation for the Live Status Live Activity — pure functions only.
 * Kept free of react-native / expo imports so it stays unit-testable
 * (see src/__tests__/live-activity.test.ts).
 */

export type ZonaLiveActivitySnapshot = {
  unreadCount: number;
  latestTitle: string | null;
  latestSource: string | null;
  latestId: string | null;
  latestCreatedAt: string | null;
};

/**
 * Lock-screen palette. Mirrors theme `primaryDark` / `white` / `primarySoft`;
 * hexes are duplicated because this module must not import `@/theme`
 * (react-native). The test locks the values so a rebrand fails loudly.
 */
export const LIVE_ACTIVITY_COLORS = {
  background: '#25564C',
  title: '#FFFFFF',
  subtitle: '#DDECE6',
} as const;

/** Native SF Symbol rendered by the iOS widget extension, not a bundled image. */
export const LIVE_ACTIVITY_SYMBOL = 'sf:bell.badge.fill' as const;

function waitingLabel(count: number) {
  if (count <= 0) return translate('live.allClear');
  return translateCount('live.waiting.one', 'live.waiting.other', count);
}

/**
 * Glance-card state: count leads the title, subtitle carries source + recency.
 * No progressBar — the old 8-hour session countdown was an Apple lifetime
 * artifact, not inbox information, and it consumed every island region.
 */
export function buildLiveActivityState(snapshot: ZonaLiveActivitySnapshot) {
  const unread = Math.max(0, snapshot.unreadCount);
  const alertTitle = snapshot.latestTitle?.trim() ?? '';
  const title = (alertTitle ? translate('live.unreadTitle', { count: unread, title: alertTitle }) : waitingLabel(unread)).slice(0, 80);

  const source = snapshot.latestSource?.trim() || 'Zona';
  const updated = snapshot.latestCreatedAt ? relativeTimeShort(snapshot.latestCreatedAt) : '';
  const subtitle = [source, updated ? translate('live.updated', { time: updated }) : ''].filter(Boolean).join(' · ');

  return {
    title,
    subtitle,
    imageName: LIVE_ACTIVITY_SYMBOL,
    dynamicIslandImageName: LIVE_ACTIVITY_SYMBOL,
  };
}

export function buildLiveActivityConfig(snapshot: ZonaLiveActivitySnapshot) {
  const deepLinkUrl = snapshot.latestId
    ? `/notification/${snapshot.latestId}`
    : '/';

  return {
    backgroundColor: LIVE_ACTIVITY_COLORS.background,
    titleColor: LIVE_ACTIVITY_COLORS.title,
    subtitleColor: LIVE_ACTIVITY_COLORS.subtitle,
    deepLinkUrl,
    padding: { horizontal: 16, top: 14, bottom: 14 },
    imagePosition: 'left' as const,
    imageAlign: 'center' as const,
    imageSize: { width: 44, height: 44 },
    contentFit: 'contain' as const,
  };
}
