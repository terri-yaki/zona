import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';
import { RuntimeStatusBanner } from '@/components/RuntimeStatusBanner';
import { useThemedStyles } from '@/theme-preference';

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
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView edges={edges} style={[styles.safe, style]}>
      <RuntimeStatusBanner />
      {children}
    </SafeAreaView>
  );
}

/** Bottom padding for scroll/list content under the native tab bar. */
export function useTabBarContentPadding(extra = 24) {
  const insets = useSafeAreaInsets();
  // NativeTabs already applies Android's bottom system/tab-bar inset.
  if (Platform.OS === 'android') return extra;
  // Native tab bar is roughly 49pt content + home indicator; keep a cushion.
  return Math.max(insets.bottom, 8) + 56 + extra;
}

/** Bottom padding for stack screens and sheets rendered outside NativeTabs. */
export function useBottomSafePadding(extra = 16) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + extra;
}

export function TabScrollBackground({ children }: { children?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.fill}>{children}</View>;
}

const createStyles = () => StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  fill: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
