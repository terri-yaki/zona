import type { SFSymbol } from 'expo-symbols';
import type { ReactElement, ReactNode } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';

type Props = {
  name: SFSymbol;
  color?: ColorValue;
  size?: number;
  fallback?: string;
};

type SymbolViewComponent = (props: {
  name: SFSymbol | string;
  tintColor?: ColorValue;
  size?: number;
  weight?: string;
  resizeMode?: string;
  fallback?: ReactNode;
}) => ReactElement | null;

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

  const Symbol = view;
  return (
    <Symbol
      fallback={<FallbackIcon color={color} fallback={fallback} size={size} />}
      name={name}
      resizeMode="scaleAspectFit"
      size={size}
      tintColor={color}
      weight="semibold"
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontWeight: '700', lineHeight: 18 },
});
