import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  background: '#F3F6F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EAF0ED',
  text: '#17221E',
  textSoft: '#34433D',
  muted: '#6E7B75',
  mutedLight: '#96A19C',
  border: '#DDE5E1',
  primary: '#2F6B5F',
  primaryDark: '#25564C',
  primarySoft: '#DDECE6',
  accent: '#D98556',
  accentSoft: '#F8E8DE',
  danger: '#B84A4A',
  dangerSoft: '#F9E8E7',
  success: '#2B7A61',
  successSoft: '#E2F2EA',
  unread: '#EDF7F2',
  white: '#FFFFFF',
};

export const radius = {
  small: 10,
  medium: 16,
  large: 24,
  full: 999,
};

const webShadow = (boxShadow: string) => ({ boxShadow }) as ViewStyle;

export const shadows: Record<'card' | 'floating', ViewStyle> = {
  card: Platform.OS === 'web'
    ? webShadow('0 5px 14px rgba(23, 56, 47, 0.06)')
    : { shadowColor: '#17382F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  floating: Platform.OS === 'web'
    ? webShadow('0 8px 18px rgba(23, 56, 47, 0.16)')
    : { shadowColor: '#17382F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 5 },
};
