import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { getAuthCapabilities, type AuthCapabilities } from '@/lib/auth-capabilities';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export default function SignInScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session, authError, clearAuthError, continueAsGuest, sendEmailAuth, startProvider } = useAuth();
  const { t } = useI18n();
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);

  useEffect(() => {
    let active = true;
    void getAuthCapabilities().then((value) => {
      if (active) setCapabilities(value);
    });
    return () => { active = false; };
  }, []);

  if (session) return <Redirect href="/" />;

  async function continueAnonymously() {
    if (capabilities?.anonymous !== true) return;
    setSigningIn(true);
    clearAuthError();
    try {
      await continueAsGuest();
    } catch (error) {
      Alert.alert(t('auth.signInError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setSigningIn(false);
    }
  }

  async function continueWithEmail() {
    if (signingIn || capabilities?.email !== true) return;
    setSigningIn(true);
    clearAuthError();
    try {
      const transaction = await sendEmailAuth(email, creatingAccount ? 'sign_up' : 'sign_in');
      router.push({
        pathname: '/auth/check-email' as never,
        params: { email: transaction.email ?? email, intent: transaction.intent, transaction: transaction.id },
      });
    } catch (error) {
      Alert.alert(t('auth.signInError'), error instanceof Error && error.message === 'INVALID_EMAIL'
        ? t('auth.emailInvalid')
        : error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setSigningIn(false);
    }
  }

  async function continueWithProvider(provider: 'apple' | 'github' | 'google') {
    if (signingIn) return;
    setSigningIn(true);
    clearAuthError();
    try {
      const result = await startProvider(provider, creatingAccount ? 'sign_up' : 'sign_in');
      if (result) router.replace('/');
    } catch (error) {
      Alert.alert(t('auth.signInError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <View pointerEvents="none" style={styles.orbLarge} />
      <View pointerEvents="none" style={styles.orbSmall} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <View style={styles.mark}><AppIcon color={colors.white} fallback="Z" name="bell.badge.fill" size={25} /></View>
            <Text style={styles.brand}>Zona</Text>
          </View>
          <Text style={styles.title}>{t('auth.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          <View style={styles.formCard}>
            {!capabilities ? <ActivityIndicator color={colors.primary} style={styles.capabilityLoader} /> : null}
            {Platform.OS === 'ios' && capabilities?.apple ? (
              <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void continueWithProvider('apple')} style={({ pressed }) => [styles.providerDark, signingIn && styles.disabled, pressed && styles.pressedDark]}>
                <AppIcon color={colors.white} fallback="A" name="apple.logo" size={18} />
                <Text style={styles.providerDarkText}>{t('auth.continueApple')}</Text>
              </Pressable>
            ) : null}
            {capabilities?.google ? <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void continueWithProvider('google')} style={({ pressed }) => [styles.provider, signingIn && styles.disabled, pressed && styles.providerPressed]}>
              <Text style={styles.providerMark}>G</Text><Text style={styles.providerText}>{t('auth.continueGoogle')}</Text>
            </Pressable> : null}
            {capabilities?.github ? <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void continueWithProvider('github')} style={({ pressed }) => [styles.provider, signingIn && styles.disabled, pressed && styles.providerPressed]}>
              <Text style={styles.providerMark}>⌘</Text><Text style={styles.providerText}>{t('auth.continueGithub')}</Text>
            </Pressable> : null}

            {capabilities?.email ? <>
              {capabilities.apple || capabilities.google || capabilities.github ? <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>{t('auth.orEmail')}</Text><View style={styles.divider} /></View> : <View style={styles.emailSpacer} />}
              <TextInput
                accessibilityLabel={t('auth.email')}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={!signingIn}
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={() => void continueWithEmail()}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.mutedLight}
                style={styles.input}
                value={email}
              />
              <Pressable accessibilityRole="button" disabled={signingIn || !email.trim()} onPress={() => void continueWithEmail()} style={({ pressed }) => [styles.button, styles.emailButton, (signingIn || !email.trim()) && styles.disabled, pressed && styles.pressed]}>
                {signingIn ? <ActivityIndicator color={colors.white} /> : <><Text style={styles.buttonText}>{creatingAccount ? t('auth.createWithEmail') : t('auth.continueEmail')}</Text><AppIcon color={colors.white} fallback="›" name="arrow.right" size={17} /></>}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setCreatingAccount((value) => !value)} style={styles.modeButton}>
                <Text style={styles.modeText}>{creatingAccount ? t('auth.haveAccount') : t('auth.needAccount')}</Text>
              </Pressable>
            </> : null}

            {capabilities?.anonymous ? <>
              {capabilities.email || capabilities.apple || capabilities.google || capabilities.github ? <View style={styles.guestDivider} /> : null}
              <Pressable accessibilityRole="button" disabled={signingIn} onPress={continueAnonymously} style={({ pressed }) => [styles.guestButton, signingIn && styles.disabled, pressed && styles.providerPressed]}>
                <Text style={styles.guestText}>{t('auth.tryPrivately')}</Text>
              </Pressable>
              <Text style={styles.privacy}>{t('auth.privateAccount')}</Text>
            </> : null}
          </View>
          {authError ? <View accessibilityLiveRegion="polite" style={styles.errorBox}><AppIcon color={colors.danger} fallback="!" name="exclamationmark.triangle.fill" size={17} /><Text style={styles.errorText}>{authError}</Text></View> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1, overflow: 'hidden' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { alignSelf: 'center', maxWidth: 520, width: '100%' },
  orbLarge: { backgroundColor: colors.primarySoft, borderRadius: 180, height: 360, opacity: 0.7, position: 'absolute', right: -170, top: -110, width: 360 },
  orbSmall: { backgroundColor: colors.accentSoft, borderRadius: 90, bottom: -40, height: 180, left: -75, opacity: 0.8, position: 'absolute', width: 180 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 34 },
  mark: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 15, height: 48, justifyContent: 'center', width: 48 },
  brand: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.1, lineHeight: 39, marginBottom: 11, maxWidth: 340 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 28, maxWidth: 345 },
  formCard: { backgroundColor: colors.surface, borderColor: '#E7ECE9', borderRadius: radius.large, borderWidth: 1, padding: 18 },
  capabilityLoader: { marginVertical: 12 },
  providerDark: { alignItems: 'center', backgroundColor: colors.text, borderRadius: radius.medium, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 51, padding: 13 },
  providerDarkText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  pressedDark: { backgroundColor: '#28352F' },
  provider: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 9, minHeight: 51, padding: 13 },
  providerPressed: { backgroundColor: colors.surfaceMuted },
  providerMark: { color: colors.text, fontSize: 16, fontWeight: '900', textAlign: 'center', width: 20 },
  providerText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginVertical: 17 },
  divider: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerText: { color: colors.mutedLight, fontSize: 11, fontWeight: '600' },
  emailSpacer: { height: 16 },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 51, paddingHorizontal: 14 },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 53, padding: 14 },
  emailButton: { marginTop: 10 },
  modeButton: { alignItems: 'center', minHeight: 38, justifyContent: 'center' },
  modeText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  guestDivider: { backgroundColor: colors.border, height: 1, marginVertical: 12 },
  guestButton: { alignItems: 'center', borderRadius: radius.medium, justifyContent: 'center', minHeight: 45, padding: 10 },
  guestText: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  pressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.6 },
  privacy: { color: colors.mutedLight, fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'center' },
  errorBox: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 8, marginTop: 14, padding: 12 },
  errorText: { color: colors.danger, flex: 1, fontSize: 12, lineHeight: 17 },
});
