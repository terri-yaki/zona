/**
 * Theme presets: pure data, no React Native imports, so tests can assert
 * completeness without rendering. Every preset must define the full color
 * key set consumed via `colors` from `@/theme` — the default preset mirrors
 * the shipped palette exactly.
 */
import type { TranslationKey } from './i18n/en';
export const themeColorKeys = [
  'background',
  'surface',
  'surfaceMuted',
  'text',
  'textSoft',
  'muted',
  'mutedLight',
  'border',
  'primary',
  'primaryDark',
  'primarySoft',
  'primaryText',
  'accent',
  'accentSoft',
  'danger',
  'dangerSoft',
  'success',
  'successSoft',
  'unread',
  'white',
] as const;

export type ThemeColorKey = typeof themeColorKeys[number];
export type ThemePresetColors = Record<ThemeColorKey, string>;

/** Lock-screen Live Status palette; hex values passed to the native widget. */
export type ThemeLiveActivityColors = {
  background: string;
  title: string;
  subtitle: string;
};

export type ThemePreset = {
  id: string;
  /** i18n key for the display name (settings.themePreset.*). */
  nameKey: TranslationKey;
  /** 'light' presets pair with dark status-bar icons, 'dark' with light ones. */
  appearance: 'light' | 'dark';
  colors: ThemePresetColors;
  /**
   * Optional Live Activity palette override. When omitted, the Live Status
   * card derives its colors from the preset's primary family
   * (see liveActivityPalette in @/lib/live-activity-presentation).
   */
  liveActivity?: ThemeLiveActivityColors;
};

export const themePresets: ThemePreset[] = [
  {
    id: 'meadow',
    nameKey: 'settings.themePreset.meadow',
    appearance: 'light',
    colors: {
      background: '#F3F6F4',
      surface: '#FFFFFF',
      surfaceMuted: '#EAF0ED',
      text: '#17221E',
      textSoft: '#34433D',
      muted: '#6E7B75',
      mutedLight: '#5F6F68',
      border: '#DDE5E1',
      primary: '#2F6B5F',
      primaryDark: '#25564C',
      primarySoft: '#DDECE6',
      primaryText: '#2F6B5F',
      accent: '#A34A28',
      accentSoft: '#F8E8DE',
      danger: '#A93E3E',
      dangerSoft: '#F9E8E7',
      success: '#2A7259',
      successSoft: '#E2F2EA',
      unread: '#EDF7F2',
      white: '#FFFFFF',
    },
  },
  {
    id: 'ocean',
    nameKey: 'settings.themePreset.ocean',
    appearance: 'light',
    colors: {
      background: '#F1F6F9',
      surface: '#FFFFFF',
      surfaceMuted: '#E4EEF4',
      text: '#14232D',
      textSoft: '#2C3F4B',
      muted: '#647682',
      mutedLight: '#92A3AD',
      border: '#D9E4EB',
      primary: '#2B6C8F',
      primaryDark: '#215673',
      primarySoft: '#DBEAF2',
      primaryText: '#2B6C8F',
      accent: '#A34A28',
      accentSoft: '#F8E8DE',
      danger: '#A93E3E',
      dangerSoft: '#F9E8E7',
      success: '#2A7259',
      successSoft: '#E2F2EA',
      unread: '#EBF4F9',
      white: '#FFFFFF',
    },
  },
  {
    id: 'sunset',
    nameKey: 'settings.themePreset.sunset',
    appearance: 'light',
    colors: {
      background: '#FAF4F0',
      surface: '#FFFFFF',
      surfaceMuted: '#F5EAE3',
      text: '#2A1D15',
      textSoft: '#443024',
      muted: '#7E6E62',
      mutedLight: '#A8988C',
      border: '#EDDDD2',
      primary: '#B85C38',
      primaryDark: '#9A4A2D',
      primarySoft: '#F7E3D8',
      // Sunset's orange primary only reaches 3.7:1 on primarySoft, so
      // primary-colored text uses the deeper primaryDark instead.
      primaryText: '#9A4A2D',
      accent: '#2F6B5F',
      accentSoft: '#DDECE6',
      danger: '#A93E3E',
      dangerSoft: '#F9E8E7',
      success: '#2A7259',
      successSoft: '#E2F2EA',
      unread: '#FBF0E8',
      white: '#FFFFFF',
    },
  },
  {
    id: 'violet',
    nameKey: 'settings.themePreset.violet',
    appearance: 'light',
    colors: {
      background: '#F6F3F9',
      surface: '#FFFFFF',
      surfaceMuted: '#EDE7F3',
      text: '#1F1829',
      textSoft: '#372D44',
      muted: '#6F667A',
      mutedLight: '#9A92A4',
      border: '#E3DCEB',
      primary: '#6B4E9B',
      primaryDark: '#573E80',
      primarySoft: '#E9E1F5',
      primaryText: '#6B4E9B',
      accent: '#A34A28',
      accentSoft: '#F8E8DE',
      danger: '#A93E3E',
      dangerSoft: '#F9E8E7',
      success: '#2A7259',
      successSoft: '#E2F2EA',
      unread: '#F1ECF8',
      white: '#FFFFFF',
    },
  },
  {
    id: 'minimalist',
    nameKey: 'settings.themePreset.minimalist',
    appearance: 'light',
    colors: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceMuted: '#F2F2F2',
      text: '#0A0A0A',
      textSoft: '#242424',
      muted: '#6E6E6E',
      mutedLight: '#9A9A9A',
      border: '#E4E4E4',
      primary: '#0A0A0A',
      primaryDark: '#000000',
      primarySoft: '#EDEDED',
      primaryText: '#0A0A0A',
      accent: '#0A0A0A',
      accentSoft: '#F0F0F0',
      danger: '#3D3D3D',
      dangerSoft: '#EFEFEF',
      success: '#2E2E2E',
      successSoft: '#F0F0F0',
      unread: '#F5F5F5',
      white: '#FFFFFF',
    },
  },
  {
    id: 'marshmallow',
    nameKey: 'settings.themePreset.marshmallow',
    appearance: 'light',
    colors: {
      background: '#FDF2F5',
      surface: '#FFFFFF',
      surfaceMuted: '#F7E9EE',
      text: '#2C1B26',
      textSoft: '#523B48',
      muted: '#7A5E6D',
      mutedLight: '#9A7E8D',
      border: '#F0DDE4',
      primary: '#A33B6B',
      primaryDark: '#7C2D52',
      primarySoft: '#F3D9E5',
      primaryText: '#A33B6B',
      // Darkened from #7B61A9: accent-on-accentSoft (category badges) was
      // 4.26:1, below the WCAG AA 4.5:1 floor asserted in theme-contrast.test.
      accent: '#6F5499',
      accentSoft: '#F0E8F7',
      danger: '#A93E3E',
      dangerSoft: '#F9E8E7',
      success: '#2A7259',
      successSoft: '#E2F2EA',
      unread: '#FCEFF3',
      white: '#FFFFFF',
    },
  },
  {
    id: 'neon',
    nameKey: 'settings.themePreset.neon',
    appearance: 'dark',
    colors: {
      background: '#0B0B10',
      surface: '#15151D',
      surfaceMuted: '#1D1D28',
      text: '#F5F5FA',
      textSoft: '#D9D9E6',
      muted: '#9C9CAD',
      mutedLight: '#7C7C8E',
      border: '#2A2A38',
      primary: '#00805A',
      primaryDark: '#006347',
      primarySoft: '#0E2B21',
      // Neon's deep primary is a surface color (white-on-primary buttons); it
      // only reaches ~3.7:1 on dark surfaces, so primary-colored text uses
      // this bright mint, which clears 4.5:1 on every dark surface.
      primaryText: '#00E5A0',
      accent: '#FF3D8A',
      accentSoft: '#381226',
      danger: '#FF5470',
      dangerSoft: '#3A1220',
      success: '#2BD97C',
      successSoft: '#0E2A1C',
      unread: '#101D17',
      white: '#FFFFFF',
    },
    // Neon reads best as a dark lock-screen card with the neon mint leading,
    // rather than the default primaryDark surface used by light presets.
    liveActivity: {
      background: '#101018',
      title: '#00E5A0',
      subtitle: '#9C9CAD',
    },
  },
];

export const defaultThemePreset = themePresets[0];

export function findThemePreset(id: unknown): ThemePreset | null {
  return themePresets.find((preset) => preset.id === id) ?? null;
}
