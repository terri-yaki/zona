import { Redirect } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS, Platform } from 'react-native';

import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors } from '@/theme';

/**
 * Native liquid glass tab bar via Expo Router NativeTabs (SDK 54+).
 * Uses the system UITabBarController on iOS — real liquid glass on iOS 26+,
 * native translucent tab bar on earlier iOS — not a JS BlurView recreation.
 * @see https://docs.expo.dev/router/advanced/native-tabs/
 */
export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <NativeTabs
      backgroundColor={Platform.OS === 'ios' ? null : colors.surface}
      blurEffect="systemChromeMaterial"
      disableTransparentOnScrollEdge={false}
      iconColor={Platform.OS === 'ios'
        ? {
            default: DynamicColorIOS({ light: colors.mutedLight, dark: '#A8B3AE' }),
            selected: DynamicColorIOS({ light: colors.primary, dark: '#6FBFAD' }),
          }
        : {
            default: colors.mutedLight,
            selected: colors.primary,
          }}
      indicatorColor={colors.primarySoft}
      labelStyle={{
        default: { color: colors.mutedLight, fontSize: 11, fontWeight: '600' },
        selected: { color: colors.primary, fontSize: 11, fontWeight: '700' },
      }}
      minimizeBehavior="automatic"
      tintColor={colors.primary}
    >
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'tray', selected: 'tray.full.fill' }} />
        <Label>{t('tabs.inbox')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sources">
        <Icon sf={{ default: 'key', selected: 'key.fill' }} />
        <Label>{t('tabs.sources')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>{t('tabs.settings')}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
