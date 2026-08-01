import type { Session } from '@supabase/supabase-js';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearPrivateUserState } from '@/cache/private-state';
import { AppIcon } from '@/components/AppIcon';
import { cancelGuestTransfer, commitGuestTransfer, previewGuestTransfer, type AccountTransfer } from '@/lib/account-transfer';
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

export default function AccountTransferScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useI18n();
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState<Session | null>(null);
  const [transfer, setTransfer] = useState<AccountTransfer | null>(null);
  const emailClient = useRef<ReturnType<typeof createSecondaryAuthClient> | null>(null);
  const destinationRef = useRef<Session | null>(null);
  const transferRef = useRef<AccountTransfer | null>(null);
  const completedRef = useRef(false);

  useEffect(() => { void getAuthCapabilities().then(setCapabilities); }, []);
  useEffect(() => () => {
    if (completedRef.current) return;
    const pendingDestination = destinationRef.current;
    const pendingTransfer = transferRef.current;
    if (pendingDestination) void releaseSecondarySession(pendingDestination);
    if (pendingTransfer) void cancelGuestTransfer(pendingTransfer.transferId).catch(() => undefined);
  }, []);

  if (!session) return <Redirect href="/sign-in" />;
  if (!session.user.is_anonymous) return <Redirect href={'/account' as never} />;

  async function showPreview(proof: Session) {
    if (proof.user.id === session?.user.id || proof.user.is_anonymous) {
      await releaseSecondarySession(proof);
      Alert.alert(t('transfer.notProtectedTitle'), t('transfer.notProtectedBody'));
      return;
    }
    setBusy(true);
    try {
      const result = await previewGuestTransfer(proof);
      setDestination(proof);
      destinationRef.current = proof;
      setTransfer(result);
      transferRef.current = result;
    } catch (error) {
      await releaseSecondarySession(proof);
      Alert.alert(t('transfer.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    try {
      const result = await sendSecondaryEmailCode(email);
      emailClient.current = result.client;
      setEmail(result.email);
      setCodeSent(true);
      setCode('');
    } catch (error) {
      Alert.alert(t('transfer.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally { setBusy(false); }
  }

  async function verifyCode() {
    if (!emailClient.current) return;
    setBusy(true);
    try {
      await showPreview(await verifySecondaryEmailCode(emailClient.current, email, code));
    } catch (error) {
      Alert.alert(t('transfer.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  async function authenticateWithProvider(provider: SecondaryProvider) {
    setBusy(true);
    try {
      const proof = await authenticateSecondaryProvider(provider);
      if (proof) await showPreview(proof);
    } catch (error) {
      Alert.alert(t('transfer.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally { setBusy(false); }
  }

  async function commit() {
    if (!destination || !transfer || !session) return;
    setBusy(true);
    try {
      await commitGuestTransfer(transfer.transferId, destination);
      const guestUserId = session.user.id;
      const { error } = await supabase.auth.setSession({
        access_token: destination.access_token,
        refresh_token: destination.refresh_token,
      });
      if (error) throw error;
      await clearPrivateUserState(guestUserId).catch(() => undefined);
      completedRef.current = true;
      router.replace('/');
    } catch (error) {
      Alert.alert(t('transfer.failedTitle'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (transfer) await cancelGuestTransfer(transfer.transferId).catch(() => undefined);
    if (destination) await releaseSecondarySession(destination);
    transferRef.current = null;
    destinationRef.current = null;
    router.back();
  }

  const providers: { enabled: boolean; label: string; name: SecondaryProvider }[] = [
    { enabled: Platform.OS === 'ios' && capabilities?.apple === true, label: 'Apple', name: 'apple' },
    { enabled: capabilities?.google === true, label: 'Google', name: 'google' },
    { enabled: capabilities?.github === true, label: 'GitHub', name: 'github' },
  ];
  const hasLimitConflict = transfer?.preview.sourceLimitConflict
    || transfer?.preview.keyLimitConflict
    || transfer?.preview.phoneLimitConflict;

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.icon}><AppIcon color={colors.primary} fallback="↗" name="arrow.triangle.2.circlepath" size={29} /></View>
          <Text style={styles.title}>{transfer ? t('transfer.previewTitle') : t('transfer.title')}</Text>
          <Text style={styles.body}>{transfer ? t('transfer.previewBody') : t('transfer.body')}</Text>

          {transfer ? <View style={styles.preview}>
            <PreviewRow label={t('transfer.sources')} value={transfer.preview.sources} />
            <PreviewRow label={t('transfer.keys')} value={transfer.preview.activeKeys} />
            <PreviewRow label={t('transfer.alerts')} value={transfer.preview.notifications} />
            <PreviewRow label={t('transfer.attachments')} value={transfer.preview.attachments} />
            <Text style={styles.preferenceNote}>{transfer.preview.destinationKeepsPreferences ? t('transfer.preferencesKept') : t('transfer.preferencesMoved')}</Text>
            {hasLimitConflict ? <Text style={styles.limitWarning}>{t('transfer.limitConflict')}</Text> : null}
          </View> : <>
            {capabilities?.email ? <>
              <TextInput accessibilityLabel={t('auth.email')} autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!busy && !codeSent} keyboardType="email-address" onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={colors.mutedLight} style={styles.input} value={email} />
              {codeSent ? <TextInput accessibilityLabel={t('auth.codeLabel')} autoComplete="one-time-code" editable={!busy} keyboardType="number-pad" maxLength={8} onChangeText={setCode} onSubmitEditing={() => void verifyCode()} placeholder={t('auth.codePlaceholder')} placeholderTextColor={colors.mutedLight} style={[styles.input, styles.codeInput]} value={code} /> : null}
              <Pressable accessibilityRole="button" disabled={busy || (codeSent ? code.trim().length < 6 : !email.trim())} onPress={() => void (codeSent ? verifyCode() : sendCode())} style={[styles.primary, (busy || (codeSent ? code.trim().length < 6 : !email.trim())) && styles.disabled]}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{codeSent ? t('transfer.showPreview') : t('transfer.signInEmail')}</Text>}
              </Pressable>
            </> : null}
            {providers.filter((provider) => provider.enabled).map((provider) => <Pressable accessibilityRole="button" disabled={busy} key={provider.name} onPress={() => void authenticateWithProvider(provider.name)} style={[styles.provider, busy && styles.disabled]}><Text style={styles.providerText}>{t('transfer.signInProvider', { provider: provider.label })}</Text></Pressable>)}
            {capabilities && !capabilities.email && !providers.some((provider) => provider.enabled) ? <Text style={styles.unavailable}>{t('transfer.unavailable')}</Text> : null}
          </>}

          {transfer ? <Pressable accessibilityRole="button" disabled={busy || Boolean(hasLimitConflict)} onPress={() => void commit()} style={[styles.primary, (busy || hasLimitConflict) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{t('transfer.confirm')}</Text>}</Pressable> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void cancel()} style={styles.cancel}><Text style={styles.cancelText}>{t('common.cancel')}</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PreviewRow({ label, value }: { label: string; value: number }) {
  return <View style={styles.previewRow}><Text style={styles.previewLabel}>{label}</Text><Text style={styles.previewValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, maxWidth: 460, padding: 26, width: '100%' },
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
  preview: { backgroundColor: colors.background, borderRadius: radius.medium, marginTop: 10, padding: 14, width: '100%' },
  previewRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 35 },
  previewLabel: { color: colors.muted, fontSize: 13 },
  previewValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  preferenceNote: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8, paddingTop: 10 },
  limitWarning: { backgroundColor: colors.dangerSoft, borderRadius: radius.small, color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 10, padding: 10 },
  cancel: { marginTop: 10, padding: 10 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.55 },
});
