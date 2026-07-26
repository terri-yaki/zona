import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { Platform, type ColorValue, StyleSheet, Text, View } from 'react-native';

type Props = {
  name: SFSymbol;
  color?: ColorValue;
  size?: number;
  fallback?: string;
};

type SymbolViewComponent = (props: {
  name: SFSymbol | { android?: AndroidSymbol; ios?: SFSymbol; web?: AndroidSymbol };
  tintColor?: ColorValue;
  size?: number;
  weight?: string;
  resizeMode?: string;
  fallback?: ReactNode;
}) => ReactElement | null;

const androidSymbols = {
  'antenna.radiowaves.left.and.right': 'cell_tower',
  'arrow.clockwise': 'refresh',
  'arrow.down.circle': 'download',
  'arrow.right': 'arrow_forward',
  'bell.badge.fill': 'notifications_active',
  bell: 'notifications',
  'bolt.fill': 'bolt',
  checkmark: 'check',
  'checkmark.circle.fill': 'check_circle',
  'chevron.right': 'chevron_right',
  clock: 'schedule',
  desktopcomputer: 'computer',
  'doc.on.doc': 'content_copy',
  'exclamationmark.triangle.fill': 'warning',
  globe: 'language',
  'hand.raised.fill': 'privacy_tip',
  'key.fill': 'vpn_key',
  pencil: 'edit',
  person: 'person',
  'person.crop.circle.fill': 'account_circle',
  photo: 'image',
  'photo.fill': 'image',
  plus: 'add',
  'rectangle.3.group.fill': 'view_carousel',
  'rectangle.portrait.and.arrow.right': 'logout',
  'speaker.slash.fill': 'volume_off',
  'speaker.wave.2.fill': 'volume_up',
  sparkles: 'auto_awesome',
  trash: 'delete',
  tray: 'inbox',
  'tray.full.fill': 'inbox',
  xmark: 'close',
  'xmark.circle': 'cancel',
} satisfies Partial<Record<SFSymbol, AndroidSymbol>>;

function crossPlatformName(name: SFSymbol) {
  const android = androidSymbols[name as keyof typeof androidSymbols];
  return android ? { android, ios: name, web: android } : name;
}

let SymbolView: SymbolViewComponent | null | undefined;

function loadSymbolView(): SymbolViewComponent | null {
  if (SymbolView !== undefined) return SymbolView;
  try {
    // Lazy load so a broken native symbol module cannot crash app boot.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-symbols') as { SymbolView?: SymbolViewComponent };
    SymbolView = typeof mod.SymbolView === 'function' ? mod.SymbolView : null;
  } catch (error) {
    console.warn('expo-symbols is unavailable; using text icon fallback.', error);
    SymbolView = null;
  }
  return SymbolView;
}

function FallbackIcon({ color, size, fallback }: { color: ColorValue; size: number; fallback: string }) {
  return (
    <View style={[styles.fallback, { height: size, width: size }]}>
      <Text style={[styles.fallbackText, { color, fontSize: size * 0.72 }]}>{fallback}</Text>
    </View>
  );
}

export function AppIcon({ name, color = '#17221E', size = 22, fallback = '•' }: Props) {
  const view = loadSymbolView();
  if (!view) return <FallbackIcon color={color} fallback={fallback} size={size} />;

  return createElement(view, {
    fallback: <FallbackIcon color={color} fallback={fallback} size={size} />,
    name: crossPlatformName(name),
    resizeMode: 'scaleAspectFit',
    size,
    tintColor: color,
    weight: Platform.OS === 'ios' ? 'semibold' : undefined,
  });
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontWeight: '700', lineHeight: 18 },
});
