import * as Device from 'expo-device';
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

/**
 * Extra cushion (pt) so iPhone content clears the floating tab bar
 * (roughly 49pt of bar above the home-indicator inset).
 */
export const IPHONE_TAB_BAR_CUSHION = 56;

/**
 * Bottom padding for content under the native tab bar, by platform/device.
 * - Android: NativeTabs already applies the bottom system/tab-bar inset.
 * - iPad: iPadOS 18+ can float the tab bar at the top or collapse it into a
 *   sidebar, so the iPhone's fixed bar + home-indicator cushion does not
 *   hold; the safe-area insets (and TabScreen's top edge) carry whichever
 *   placement the system picks.
 * - iPhone (and unknown devices): keep the floating-bar cushion.
 */
export function resolveTabBarContentPadding(
  platform: string,
  deviceType: Device.DeviceType | null,
  bottomInset: number,
  extra: number,
): number {
  if (platform === 'android') return extra;
  if (deviceType === Device.DeviceType.TABLET) return Math.max(bottomInset, 8) + extra;
  return Math.max(bottomInset, 8) + IPHONE_TAB_BAR_CUSHION + extra;
}

/** Bottom padding for scroll/list content under the native tab bar. */
export function useTabBarContentPadding(extra = 24) {
  const insets = useSafeAreaInsets();
  return resolveTabBarContentPadding(Platform.OS, Device.deviceType, insets.bottom, extra);
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
