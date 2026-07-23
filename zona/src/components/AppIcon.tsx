import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';

type Props = {
  name: SFSymbol;
  color?: ColorValue;
  size?: number;
  fallback?: string;
};

export function AppIcon({ name, color = '#17221E', size = 22, fallback = '•' }: Props) {
  return (
    <SymbolView
      fallback={<View style={[styles.fallback, { height: size, width: size }]}><Text style={[styles.fallbackText, { color, fontSize: size * 0.72 }]}>{fallback}</Text></View>}
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
