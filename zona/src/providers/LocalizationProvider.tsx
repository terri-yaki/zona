import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  isLanguagePreference,
  languageAutonym,
  resolveLanguage,
  setActiveLanguage,
  translate,
  translateCount,
  type LanguagePreference,
  type SupportedLanguage,
  type TranslationParams,
} from '@/i18n';
import type { TranslationKey } from '@/i18n/en';

const STORAGE_KEY = 'zona.language.v1';

type LocalizationContextValue = {
  language: SupportedLanguage;
  languageName: string;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  tc: (
    oneKey: TranslationKey,
    otherKey: TranslationKey,
    count: number,
    params?: TranslationParams,
  ) => string;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: PropsWithChildren) {
  const locales = useLocales();
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  const language = resolveLanguage(preference, locales);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && isLanguagePreference(stored)) setPreferenceState(stored);
      })
      .catch((error) => console.warn('Could not restore the app language.', error));
    return () => { active = false; };
  }, []);

  setActiveLanguage(language);

  const setPreference = useCallback(async (next: LanguagePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.warn('Could not save the app language.', error);
    }
  }, []);

  const value = useMemo<LocalizationContextValue>(() => ({
    language,
    languageName: languageAutonym(language),
    preference,
    setPreference,
    t: (key, params) => translate(key, params, language),
    tc: (oneKey, otherKey, count, params) => translateCount(oneKey, otherKey, count, params, language),
  }), [language, preference, setPreference]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useI18n() {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error('useI18n must be used within LocalizationProvider.');
  return value;
}
