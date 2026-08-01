import type { Session } from '@supabase/supabase-js';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearPrivateUserState } from '@/cache/private-state';
import { AppIcon } from '@/components/AppIcon';
import { createReauthGrant, performAccountSecurityAction, type SensitiveAccountAction } from '@/lib/account-security';
import { deleteAccount } from '@/lib/api';
import { getAuthCapabilities, type AuthCapabilities } from '@/lib/auth-capabilities';
import {
  authenticateSecondaryProvider,
  sendSecondaryEmailCode,
  releaseSecondarySession,
  verifySecondaryEmailCode,
  type createSecondaryAuthClient,
  type SecondaryProvider,
} from '@/lib/secondary-auth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function parseAction(value: string): SensitiveAccountAction | null {
  return ['account.delete', 'identity.link', 'identity.unlink', 'installation.revoke', 'sessions.revoke.others', 'sessions.revoke.all'].includes(value)
    ? value as SensitiveAccountAction
    : null;
}

export default function ReauthScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { session, sendEmailAuth, startProvider } = useAuth();
  const { t } = useI18n();
  const action = parseAction(first(params.action));
  const target = first(params.target);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailClient = useRef<ReturnType<typeof createSecondaryAuthClient> | null>(null);

  useEffect(() => {
    void getAuthCapabilities().then(setCapabilities);
  }, []);

  if (!session) return <Redirect href="/sign-in" />;
  if (!action) return <Redirect href={'/account' as never} />;

  async function complete(proof: Session) {
    if (!session || !action) return;
    if (proof.user.id !== session.user.id) {
      await releaseSecondarySession(proof);
      Alert.alert(t('reauth.conflictTitle'), t('reauth.conflictBody'));
      return;
    }
    setBusy(true);
    try {
      const grant = await createReauthGrant(action, target, proof);
      if (action === 'account.delete') {
        await deleteAccount(session.user.id, grant);
        await supabase.auth.signOut({ scope: 'local' });
        await clearPrivateUserState(session.user.id).catch(() => undefined);
        router.replace('/sign-in');
        return;
      }
      if (action === 'identity.link') {
        await performAccountSecurityAction(action, target, grant);
        if (target.startsWith('email:')) {
          const linkEmail = target.slice('email:'.length);
          const transaction = await sendEmailAuth(linkEmail, 'link_method');
          router.replace({
            pathname: '/auth/check-email' as never,
            params: { email: transaction.email ?? linkEmail, intent: transaction.intent, transaction: transaction.id },
          });
          return;
        }
        const provider = target.slice('provider:'.length) as SecondaryProvider;
        const result = await startProvider(provider, 'link_method');
        if (result) router.replace('/account' as never);
        return;
      }
      await performAccountSecurityAction(action, target, grant);
      if (action === 'sessions.revoke.all') {
        await supabase.auth.signOut({ scope: 'local' });
        await clearPrivateUserState(session.user.id).catch(() => undefined);
        router.replace('/sign-in');
      } else {
        router.replace('/account' as never);
      }
    } catch (error) {
      Alert.alert(t('reauth.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      await releaseSecondarySession(proof);
      setBusy(false);
    }
  }

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await sendSecondaryEmailCode(email);
      emailClient.current = result.client;
      setEmail(result.email);
      setCodeSent(true);
      setCode('');
    } catch (error) {
      Alert.alert(t('reauth.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!emailClient.current || busy || code.trim().length < 6) return;
    setBusy(true);
    try {
      const proof = await verifySecondaryEmailCode(emailClient.current, email, code);
      await complete(proof);
    } catch (error) {
      Alert.alert(t('reauth.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmWithProvider(provider: SecondaryProvider) {
    if (busy) return;
    setBusy(true);
    try {
      const proof = await authenticateSecondaryProvider(provider);
      if (proof) await complete(proof);
    } catch (error) {
      Alert.alert(t('reauth.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  const providers: { enabled: boolean; label: string; name: SecondaryProvider }[] = [
    { enabled: Platform.OS === 'ios' && capabilities?.apple === true, label: 'Apple', name: 'apple' },
    { enabled: capabilities?.google === true, label: 'Google', name: 'google' },
    { enabled: capabilities?.github === true, label: 'GitHub', name: 'github' },
  ];
  const remainingIdentities = session.user.identities?.filter((identity) => identity.identity_id !== target) ?? [];
  const proofProviders = new Set(remainingIdentities.map((identity) => identity.provider));
  // identities is optional on the session; fall back to session.user.email when the
  // array is empty or missing so email OTP still appears for protected accounts.
  const canUseEmail = capabilities?.email === true && (
    proofProviders.has('email')
    || (Boolean(session.user.email) && (!session.user.identities || session.user.identities.length === 0))
  );
  const availableProviders = providers.filter((provider) => provider.enabled && proofProviders.has(provider.name));

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <View style={styles.icon}><AppIcon color={colors.primary} fallback="✓" name="checkmark.shield.fill" size={29} /></View>
        <Text style={styles.title}>{t('reauth.title')}</Text>
        <Text style={styles.body}>{t(`reauth.action.${action}`)}</Text>

        {canUseEmail ? <>
          <TextInput
            accessibilityLabel={t('auth.email')}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.mutedLight}
            style={styles.input}
            value={email}
          />
          {codeSent ? <TextInput
            accessibilityLabel={t('auth.codeLabel')}
            autoComplete="one-time-code"
            editable={!busy}
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={setCode}
            onSubmitEditing={() => void verifyCode()}
            placeholder={t('auth.codePlaceholder')}
            placeholderTextColor={colors.mutedLight}
            style={[styles.input, styles.codeInput]}
            value={code}
          /> : null}
          <Pressable accessibilityRole="button" disabled={busy || (codeSent ? code.trim().length < 6 : !email.trim())} onPress={() => void (codeSent ? verifyCode() : sendCode())} style={[styles.primary, (busy || (codeSent ? code.trim().length < 6 : !email.trim())) && styles.disabled]}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{codeSent ? t('reauth.verify') : t('reauth.sendCode')}</Text>}
          </Pressable>
        </> : null}

        {availableProviders.map((provider) => (
          <Pressable accessibilityRole="button" disabled={busy} key={provider.name} onPress={() => void confirmWithProvider(provider.name)} style={[styles.provider, busy && styles.disabled]}>
            <Text style={styles.providerText}>{t('reauth.useProvider', { provider: provider.label })}</Text>
          </Pressable>
        ))}
        {capabilities && !canUseEmail && !availableProviders.length ? (
          <Text style={styles.unavailable}>{t('reauth.unavailable')}</Text>
        ) : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.back()} style={styles.cancel}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, maxWidth: 440, padding: 26, width: '100%' },
  icon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 17, textAlign: 'center' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 10, marginTop: 8, textAlign: 'center' },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 15, marginTop: 10, minHeight: 50, paddingHorizontal: 14, width: '100%' },
  codeInput: { fontSize: 20, fontWeight: '700', letterSpacing: 4, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, justifyContent: 'center', marginTop: 10, minHeight: 50, padding: 13, width: '100%' },
  primaryText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  provider: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, justifyContent: 'center', marginTop: 9, minHeight: 49, padding: 12, width: '100%' },
  providerText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  unavailable: { backgroundColor: colors.surfaceMuted, borderRadius: radius.small, color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12, padding: 12, textAlign: 'center', width: '100%' },
  cancel: { marginTop: 10, padding: 10 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.55 },
});
