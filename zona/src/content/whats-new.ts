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
    id: '2026-07-personal',
    version: '1.0.0',
    latest: true,
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
    version: '0.1.0',
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
