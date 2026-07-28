import type { SFSymbol } from 'expo-symbols';

import type { TranslationKey } from '@/i18n/en';

export type WhatsNewItem = {
  bodyKey: TranslationKey;
  icon: SFSymbol;
  titleKey: TranslationKey;
};

export type WhatsNewRelease = {
  dateKey: TranslationKey;
  id: string;
  items: WhatsNewItem[];
  latest?: boolean;
  summaryKey: TranslationKey;
  titleKey: TranslationKey;
  version: string;
};

/** Add new releases at the top. Copy stays in the language catalogs. */
export const whatsNewReleases: WhatsNewRelease[] = [
  {
    id: '2026-07-cache',
    version: '0.0.7',
    latest: true,
    dateKey: 'whatsNew.releaseCache.date',
    titleKey: 'whatsNew.releaseCache.title',
    summaryKey: 'whatsNew.releaseCache.summary',
    items: [
      { icon: 'bolt.fill', titleKey: 'whatsNew.cacheFast.title', bodyKey: 'whatsNew.cacheFast.body' },
      { icon: 'tray.full.fill', titleKey: 'whatsNew.cacheOffline.title', bodyKey: 'whatsNew.cacheOffline.body' },
      { icon: 'person.crop.circle.fill', titleKey: 'whatsNew.cachePrivate.title', bodyKey: 'whatsNew.cachePrivate.body' },
      { icon: 'internaldrive', titleKey: 'whatsNew.cacheControl.title', bodyKey: 'whatsNew.cacheControl.body' },
    ],
  },
  {
    id: '2026-07-adaptive',
    version: '0.0.6',
    dateKey: 'whatsNew.releaseAdaptive.date',
    titleKey: 'whatsNew.releaseAdaptive.title',
    summaryKey: 'whatsNew.releaseAdaptive.summary',
    items: [
      { icon: 'info.circle.fill', titleKey: 'whatsNew.guidance.title', bodyKey: 'whatsNew.guidance.body' },
      { icon: 'shield.lefthalf.filled', titleKey: 'whatsNew.steady.title', bodyKey: 'whatsNew.steady.body' },
    ],
  },
  {
    id: '2026-07-personal',
    version: '0.0.2',
    dateKey: 'whatsNew.releasePersonal.date',
    titleKey: 'whatsNew.releasePersonal.title',
    summaryKey: 'whatsNew.releasePersonal.summary',
    items: [
      {
        icon: 'globe',
        titleKey: 'whatsNew.language.title',
        bodyKey: 'whatsNew.language.body',
      },
      {
        icon: 'rectangle.3.group.fill',
        titleKey: 'whatsNew.liveStatus.title',
        bodyKey: 'whatsNew.liveStatus.body',
      },
      {
        icon: 'speaker.wave.2.fill',
        titleKey: 'whatsNew.sounds.title',
        bodyKey: 'whatsNew.sounds.body',
      },
      {
        icon: 'bolt.fill',
        titleKey: 'whatsNew.speed.title',
        bodyKey: 'whatsNew.speed.body',
      },
      {
        icon: 'photo.fill',
        titleKey: 'whatsNew.attachments.title',
        bodyKey: 'whatsNew.attachments.body',
      },
    ],
  },
  {
    id: '2026-07-foundation',
    version: '0.0.1',
    dateKey: 'whatsNew.releaseFoundation.date',
    titleKey: 'whatsNew.releaseFoundation.title',
    summaryKey: 'whatsNew.releaseFoundation.summary',
    items: [
      {
        icon: 'desktopcomputer',
        titleKey: 'whatsNew.multiSource.title',
        bodyKey: 'whatsNew.multiSource.body',
      },
      {
        icon: 'tray.full.fill',
        titleKey: 'whatsNew.inbox.title',
        bodyKey: 'whatsNew.inbox.body',
      },
      {
        icon: 'key.fill',
        titleKey: 'whatsNew.keys.title',
        bodyKey: 'whatsNew.keys.body',
      },
    ],
  },
];
