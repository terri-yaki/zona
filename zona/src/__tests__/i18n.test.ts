import { afterEach, describe, expect, it } from 'vitest';

import { en } from '../i18n/en';
import { zhHant } from '../i18n/zh-Hant';
import {
  isLanguagePreference,
  resolveLanguage,
  resolveSystemLanguage,
  setActiveLanguage,
  translate,
  translateCount,
} from '../i18n';

afterEach(() => setActiveLanguage('en'));

describe('localization', () => {
  it('keeps every catalog complete', () => {
    expect(Object.keys(zhHant).sort()).toEqual(Object.keys(en).sort());
  });

  it('resolves supported system languages and falls back to English', () => {
    expect(resolveSystemLanguage([{ languageTag: 'zh-Hant-HK', regionCode: 'HK' }])).toBe('zh-Hant');
    expect(resolveSystemLanguage([{ languageTag: 'zh-TW', regionCode: 'TW' }])).toBe('zh-Hant');
    expect(resolveSystemLanguage([{ languageTag: 'en-US', regionCode: 'US' }])).toBe('en');
    expect(resolveSystemLanguage([{ languageTag: 'fr-FR', regionCode: 'FR' }])).toBe('en');
  });

  it('honors an explicit preference over the system locale', () => {
    const locales = [{ languageTag: 'en-US', regionCode: 'US' }];
    expect(resolveLanguage('zh-Hant', locales)).toBe('zh-Hant');
    expect(resolveLanguage('system', locales)).toBe('en');
  });

  it('validates persisted preferences', () => {
    expect(isLanguagePreference('system')).toBe(true);
    expect(isLanguagePreference('zh-Hant')).toBe(true);
    expect(isLanguagePreference('ja')).toBe(false);
  });

  it('interpolates values and selects localized count forms', () => {
    expect(translate('sources.lastActive', { time: '2 minutes ago' }, 'en')).toBe('Last active 2 minutes ago');
    expect(translate('sources.lastActive', { time: '2 分鐘前' }, 'zh-Hant')).toBe('最近活躍：2 分鐘前');
    expect(translateCount('inbox.alertsWaiting.one', 'inbox.alertsWaiting.other', 1, {}, 'en')).toBe('1 notification waiting');
    expect(translateCount('inbox.alertsWaiting.one', 'inbox.alertsWaiting.other', 2, {}, 'zh-Hant')).toBe('有 2 則通知待處理');
  });
});
