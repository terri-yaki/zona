import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors } from '@/theme';
import { useThemePreferenceId } from '@/theme-preference';

/**
 * Native liquid glass tab bar via Expo Router NativeTabs (SDK 56).
 * Uses the system UITabBarController on iOS — real liquid glass on iOS 26+,
 * native translucent tab bar on earlier iOS — not a JS BlurView recreation.
 * @see https://docs.expo.dev/router/advanced/native-tabs/
 */
export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  // Re-render on theme switches so the tab bar re-reads the live-bound colors;
  // the explicit preset wins over the OS light/dark scheme by design.
  useThemePreferenceId();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <NativeTabs
      backgroundColor={Platform.OS === 'ios' ? undefined : colors.surface}
      blurEffect="systemChromeMaterial"
      disableTransparentOnScrollEdge={false}
      iconColor={{
        default: colors.mutedLight,
        selected: colors.primaryText,
      }}
      indicatorColor={colors.primarySoft}
      labelVisibilityMode="labeled"
      labelStyle={{
        default: { color: colors.mutedLight, fontSize: 11, fontWeight: '600' },
        // primaryText is the text-safe member of the primary family: neon's
        // deep primary only reaches ~3.7:1 on the dark tab bar.
        selected: { color: colors.primaryText, fontSize: 11, fontWeight: '700' },
      }}
      minimizeBehavior="automatic"
      rippleColor={colors.primarySoft}
      tabBarRespectsIMEInsets
      tintColor={colors.primaryText}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md={{ default: 'inbox', selected: 'inbox' }} sf={{ default: 'tray', selected: 'tray.full.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.inbox')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sources">
        <NativeTabs.Trigger.Icon md={{ default: 'key', selected: 'vpn_key' }} sf={{ default: 'key', selected: 'key.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.sources')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon md={{ default: 'settings', selected: 'settings' }} sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
