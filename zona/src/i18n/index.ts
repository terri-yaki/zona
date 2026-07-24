import type { Locale } from 'expo-localization';

import { en, type TranslationKey } from './en';
import { zhHant } from './zh-Hant';

export const supportedLanguages = ['en', 'zh-Hant'] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];
export type LanguagePreference = 'system' | SupportedLanguage;
export type TranslationParams = Record<string, string | number>;

const catalogs: Record<SupportedLanguage, Record<TranslationKey, string>> = {
  en,
  'zh-Hant': zhHant,
};

const localeTags: Record<SupportedLanguage, string> = {
  en: 'en',
  'zh-Hant': 'zh-Hant',
};

let activeLanguage: SupportedLanguage = 'en';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || supportedLanguages.includes(value as SupportedLanguage);
}

export function resolveSystemLanguage(locales: readonly Pick<Locale, 'languageTag' | 'regionCode'>[]): SupportedLanguage {
  for (const locale of locales) {
    const tag = locale.languageTag.toLowerCase();
    const region = locale.regionCode?.toUpperCase();
    if (tag.startsWith('zh-hant') || (tag.startsWith('zh') && ['HK', 'MO', 'TW'].includes(region ?? ''))) {
      return 'zh-Hant';
    }
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

export function resolveLanguage(
  preference: LanguagePreference,
  locales: readonly Pick<Locale, 'languageTag' | 'regionCode'>[],
): SupportedLanguage {
  return preference === 'system' ? resolveSystemLanguage(locales) : preference;
}

export function setActiveLanguage(language: SupportedLanguage) {
  activeLanguage = language;
}

export function getActiveLanguage() {
  return activeLanguage;
}

export function getLocaleTag(language: SupportedLanguage = activeLanguage) {
  return localeTags[language];
}

export function translate(
  key: TranslationKey,
  params: TranslationParams = {},
  language: SupportedLanguage = activeLanguage,
) {
  const template = catalogs[language][key] ?? en[key];
  return template.replace(/%\{(\w+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

export function translateCount(
  oneKey: TranslationKey,
  otherKey: TranslationKey,
  count: number,
  params: TranslationParams = {},
  language: SupportedLanguage = activeLanguage,
) {
  const key = language === 'en' && count === 1 ? oneKey : otherKey;
  return translate(key, { count, ...params }, language);
}

export function languageAutonym(language: SupportedLanguage) {
  return language === 'zh-Hant' ? '繁體中文' : 'English';
}
