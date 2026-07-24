import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

/**
 * Shared shell for NativeTabs screens.
 * - Pins content below the status bar / Dynamic Island consistently
 * - Fills the notch area with the app background (not white)
 * - Leaves bottom room so the last items clear the liquid-glass tab bar
 */
export function TabScreen({
  children,
  style,
  edges = ['top'],
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
}>) {
  return (
    <SafeAreaView edges={edges} style={[styles.safe, style]}>
      {children}
    </SafeAreaView>
  );
}

/** Bottom padding for scroll/list content under the native tab bar. */
export function useTabBarContentPadding(extra = 24) {
  const insets = useSafeAreaInsets();
  // Native tab bar is roughly 49pt content + home indicator; keep a cushion.
  return Math.max(insets.bottom, 8) + 56 + extra;
}

export function TabScrollBackground({ children }: { children?: ReactNode }) {
  return <View style={styles.fill}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  fill: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
