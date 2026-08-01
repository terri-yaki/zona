import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { enablePushNotifications, markPushOnboardingComplete } from '@/lib/push';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export default function PushOnboardingScreen() {
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { t } = useI18n();
  const { isEnabled, isVisible } = useRuntimeConfig();
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const userId = session?.user.id;

  if (!userId) return <Redirect href="/sign-in" />;
  if (!isVisible('onboarding.push') || !isEnabled('onboarding.push')) return <Redirect href="/(tabs)" />;
  const authenticatedUserId = userId;

  async function finish(ask: boolean) {
    setWorking(true);
    try {
      if (ask) {
        const result = await enablePushNotifications(authenticatedUserId);
        if (result === 'denied') Alert.alert(t('onboarding.offTitle'), t('onboarding.offBody'));
        if (result === 'simulator') Alert.alert(t('onboarding.deviceTitle'), t('onboarding.deviceBody'));
        if (result === 'expo-go') Alert.alert(t('onboarding.expoTitle'), t('onboarding.expoBody'));
        if (result === 'android-unconfigured') Alert.alert(t('onboarding.androidConfigTitle'), t('onboarding.androidConfigBody'));
      }
      await markPushOnboardingComplete(authenticatedUserId);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(t('onboarding.errorTitle'), error instanceof Error ? error.message : t('onboarding.errorBody'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.illustration}>
        <View style={styles.ringOuter}>
          <View style={styles.bell}><AppIcon color={colors.white} fallback="●" name="bell.badge.fill" size={34} /></View>
        </View>
        <View style={styles.accentDot} />
      </View>
      <Text style={styles.eyebrow}>{t('onboarding.eyebrow')}</Text>
      <Text style={styles.title}>{t('onboarding.title')}</Text>
      <Text style={styles.body}>{t('onboarding.body')}</Text>
      <View style={styles.featureCard}>
        <Feature icon="desktopcomputer" text={t('onboarding.sourceFeature')} />
        <View style={styles.divider} />
        <Feature icon="clock" text={t('onboarding.historyFeature')} />
      </View>
      <Pressable accessibilityRole="button" disabled={working} onPress={() => finish(true)} style={[styles.primary, working && styles.disabled]}>
        {working ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{t('onboarding.enable')}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={working} onPress={() => finish(false)} style={styles.secondary}>
        <Text style={styles.secondaryText}>{t('common.notNow')}</Text>
      </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ icon, text }: { icon: 'desktopcomputer' | 'clock'; text: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.featureRow}><View style={styles.featureIcon}><AppIcon color={colors.primary} name={icon} size={19} /></View><Text style={styles.featureText}>{text}</Text></View>;
}

const createStyles = () => StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  page: { alignItems: 'stretch', flexGrow: 1, justifyContent: 'center', padding: 26 },
  illustration: { alignSelf: 'center', marginBottom: 26, position: 'relative' },
  ringOuter: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, height: 112, justifyContent: 'center', width: 112 },
  bell: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 25, height: 62, justifyContent: 'center', width: 62 },
  accentDot: { backgroundColor: colors.accent, borderColor: colors.background, borderRadius: radius.full, borderWidth: 5, height: 28, position: 'absolute', right: 3, top: 3, width: 28 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10, textAlign: 'center' },
  title: { color: colors.text, fontSize: 29, fontWeight: '800', letterSpacing: -0.7, lineHeight: 34, marginBottom: 11, textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 24, paddingHorizontal: 8, textAlign: 'center' },
  featureCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, marginBottom: 24, paddingHorizontal: 17 },
  featureRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 14 },
  featureIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
  featureText: { color: colors.textSoft, flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  divider: { backgroundColor: colors.border, height: 1, marginLeft: 48 },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, minHeight: 53, justifyContent: 'center' },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondary: { alignItems: 'center', padding: 16 },
  secondaryText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
