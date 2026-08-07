import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { fallbackAuthCapabilities, getAuthCapabilities, type AuthCapabilities } from '@/lib/auth-capabilities';
import { describeAuthError, resendSignupConfirmation } from '@/lib/auth-flow';
import { validateAuthPassword } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export default function SignInScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session, authError, clearAuthError, sendEmailAuth, startPasswordAuth, startProvider } = useAuth();
  const { t } = useI18n();
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [usePasswordMode, setUsePasswordMode] = useState(false);
  // Seed product defaults so email/OAuth rows appear before settings returns.
  const [capabilities, setCapabilities] = useState<AuthCapabilities>(fallbackAuthCapabilities);

  useEffect(() => {
    let active = true;
    void getAuthCapabilities().then((value) => {
      if (active) setCapabilities(value);
    });
    return () => { active = false; };
  }, []);

  if (session) return <Redirect href="/" />;


  async function continueWithEmail() {
    if (signingIn || capabilities?.email !== true) return;
    if (usePasswordMode) {
      const passwordError = validateAuthPassword(password);
      if (passwordError) {
        Alert.alert(t('auth.signInError'), passwordError);
        return;
      }
      setSigningIn(true);
      clearAuthError();
      try {
        const result = await startPasswordAuth(email, password, creatingAccount ? 'sign_up' : 'sign_in');
        if ('id' in result) {
          router.push({
            pathname: '/auth/check-email' as never,
            params: { email: result.email ?? email, intent: result.intent, transaction: result.id },
          });
        } else {
          router.replace('/');
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Email not confirmed') {
          Alert.alert(t('auth.signInError'), t('auth.emailNotConfirmed'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('auth.resendEmail'), onPress: () => void resendConfirmation() },
          ]);
        } else {
          Alert.alert(t('auth.signInError'), describeAuthError(error, t('auth.connectionError')));
        }
      } finally {
        setSigningIn(false);
      }
      return;
    }
    setSigningIn(true);
    clearAuthError();
    try {
      const transaction = await sendEmailAuth(email, creatingAccount ? 'sign_up' : 'sign_in');
      router.push({
        pathname: '/auth/check-email' as never,
        params: { email: transaction.email ?? email, intent: transaction.intent, transaction: transaction.id },
      });
    } catch (error) {
      Alert.alert(t('auth.signInError'), describeAuthError(error, t('auth.connectionError')));
    } finally {
      setSigningIn(false);
    }
  }

  async function resendConfirmation() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const transaction = await resendSignupConfirmation(email);
      router.push({
        pathname: '/auth/check-email' as never,
        params: { email: transaction.email ?? email, intent: transaction.intent, transaction: transaction.id },
      });
    } catch (error) {
      Alert.alert(t('auth.emailResendFailed'), describeAuthError(error, t('auth.connectionError')));
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <View style={styles.mark}><AppIcon color={colors.white} fallback="Z" name="bell.badge.fill" size={25} /></View>
            <Text style={styles.brand}>Zona</Text>
          </View>
          <Text style={styles.title}>{t('auth.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          <View style={styles.formCard}>
            {Platform.OS === 'ios' && capabilities.apple ? (
              <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void continueWithProvider('apple')} style={({ pressed }) => [styles.providerDark, signingIn && styles.disabled, pressed && styles.pressedDark]}>
                <AppIcon color={colors.white} fallback="A" name="apple.logo" size={18} />
                <Text style={styles.providerDarkText}>{t('auth.continueApple')}</Text>
              </Pressable>
            ) : null}
            {capabilities.google ? <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void continueWithProvider('google')} style={({ pressed }) => [styles.provider, signingIn && styles.disabled, pressed && styles.providerPressed]}>
              <Text style={styles.providerMark}>G</Text><Text style={styles.providerText}>{t('auth.continueGoogle')}</Text>
            </Pressable> : null}
            {capabilities.github ? <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void continueWithProvider('github')} style={({ pressed }) => [styles.provider, signingIn && styles.disabled, pressed && styles.providerPressed]}>
              <Text style={styles.providerMark}>⌘</Text><Text style={styles.providerText}>{t('auth.continueGithub')}</Text>
            </Pressable> : null}

            {capabilities.email ? <>
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
              {usePasswordMode ? (
                <TextInput
                  accessibilityLabel={t('auth.password')}
                  autoCapitalize="none"
                  autoComplete={creatingAccount ? 'new-password' : 'password'}
                  autoCorrect={false}
                  editable={!signingIn}
                  onChangeText={setPassword}
                  onSubmitEditing={() => void continueWithEmail()}
                  placeholder={t('auth.passwordPlaceholder')}
                  placeholderTextColor={colors.mutedLight}
                  secureTextEntry
                  spellCheck={false}
                  style={[styles.input, styles.passwordInput]}
                  textContentType={creatingAccount ? 'newPassword' : 'password'}
                  value={password}
                />
              ) : null}
              <Pressable accessibilityRole="button" disabled={signingIn || !email.trim() || (usePasswordMode && !password)} onPress={() => void continueWithEmail()} style={({ pressed }) => [styles.button, styles.emailButton, (signingIn || !email.trim() || (usePasswordMode && !password)) && styles.disabled, pressed && styles.pressed]}>
                {signingIn ? <ActivityIndicator color={colors.white} /> : <><Text style={styles.buttonText}>{usePasswordMode ? t('auth.continueWithPassword') : creatingAccount ? t('auth.createWithEmail') : t('auth.continueEmail')}</Text><AppIcon color={colors.white} fallback="›" name="arrow.right" size={17} /></>}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setUsePasswordMode((value) => !value)} style={styles.modeButton}>
                <Text style={styles.modeText}>{usePasswordMode ? t('auth.useCodeInstead') : t('auth.usePassword')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setCreatingAccount((value) => !value)} style={styles.modeButton}>
                <Text style={styles.modeText}>{creatingAccount ? t('auth.haveAccount') : t('auth.needAccount')}</Text>
              </Pressable>
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
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 34 },
  mark: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 15, height: 48, justifyContent: 'center', width: 48 },
  brand: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.1, lineHeight: 39, marginBottom: 11, maxWidth: 340 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 28, maxWidth: 345 },
  formCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, padding: 18 },
  // Invariant: a `colors.text` background must always pair with a `colors.background`
  // foreground so inverted surfaces remain readable in every preset (locked by
  // the contrast test). The pressed state slides to `colors.textSoft` — the
  // background-on-textSoft pairing is asserted at >= 4.5:1 for every preset.
  providerDark: { alignItems: 'center', backgroundColor: colors.text, borderRadius: radius.medium, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 51, padding: 13 },
  providerDarkText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  pressedDark: { backgroundColor: colors.textSoft },
  provider: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 9, minHeight: 51, padding: 13 },
  providerPressed: { backgroundColor: colors.surfaceMuted },
  providerMark: { color: colors.text, fontSize: 16, fontWeight: '900', textAlign: 'center', width: 20 },
  providerText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginVertical: 17 },
  divider: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerText: { color: colors.mutedLight, fontSize: 11, fontWeight: '600' },
  emailSpacer: { height: 16 },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 51, paddingHorizontal: 14 },
  passwordInput: { marginTop: 10 },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 53, padding: 14 },
  emailButton: { marginTop: 10 },
  modeButton: { alignItems: 'center', minHeight: 38, justifyContent: 'center' },
  modeText: { color: colors.primaryText, fontSize: 12, fontWeight: '700' },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  pressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.6 },
  errorBox: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 8, marginTop: 14, padding: 12 },
  errorText: { color: colors.danger, flex: 1, fontSize: 12, lineHeight: 17 },
});
