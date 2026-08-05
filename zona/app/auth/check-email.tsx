import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { getAuthTransaction, type AuthIntent } from '@/lib/auth-transactions';
import { resendEmailVerification } from '@/lib/auth-flow';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isEmailIntent(value: string): value is Extract<AuthIntent, 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up'> {
  return value === 'link_method' || value === 'protect_guest' || value === 'sign_in' || value === 'sign_up';
}

export default function CheckEmailScreen() {
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams();
  const router = useRouter();
  const { sendEmailAuth, verifyEmailCode } = useAuth();
  const { t } = useI18n();
  const email = first(params.email);
  const intentValue = first(params.intent);
  const intent = isEmailIntent(intentValue) ? intentValue : 'sign_in';
  const [transactionId, setTransactionId] = useState(first(params.transaction));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasLiveTransaction, setHasLiveTransaction] = useState(Boolean(transactionId));

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!transactionId) {
        if (active) setHasLiveTransaction(false);
        return;
      }
      const transaction = await getAuthTransaction(transactionId);
      if (active) setHasLiveTransaction(Boolean(transaction));
    })();
    return () => { active = false; };
  }, [transactionId]);

  async function verify() {
    if (busy || code.trim().length < 6 || !transactionId) return;
    setBusy(true);
    try {
      await verifyEmailCode({ code, email, transactionId });
      router.replace('/');
    } catch (error) {
      Alert.alert(t('auth.verifyFailed'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    try {
      const existing = await getAuthTransaction(transactionId);
      let nextTransaction;
      if (existing?.confirmation === 'signup' || existing?.intent === 'protect_guest' || existing?.intent === 'link_method') {
        nextTransaction = await resendEmailVerification(email, transactionId);
      } else {
        nextTransaction = await sendEmailAuth(email, intent);
      }
      setTransactionId(nextTransaction.id);
      setCode('');
      Alert.alert(t('auth.emailResent'), t('auth.emailResentBody'));
    } catch (error) {
      Alert.alert(t('auth.emailResendFailed'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <View style={styles.icon}><AppIcon color={colors.primary} fallback="@" name="envelope.fill" size={27} /></View>
        <Text style={styles.title}>{t('auth.checkEmailTitle')}</Text>
        <Text style={styles.body}>{t('auth.checkEmailBody', { email })}</Text>
        <TextInput
          accessibilityLabel={t('auth.codeLabel')}
          autoComplete="one-time-code"
          editable={!busy}
          keyboardType="number-pad"
          maxLength={8}
          onChangeText={setCode}
          onSubmitEditing={() => void verify()}
          placeholder={t('auth.codePlaceholder')}
          placeholderTextColor={colors.mutedLight}
          style={styles.input}
          textContentType="oneTimeCode"
          value={code}
        />
        <Pressable accessibilityRole="button" disabled={busy || code.trim().length < 6 || !transactionId} onPress={() => void verify()} style={({ pressed }) => [styles.button, (busy || code.trim().length < 6 || !transactionId) && styles.disabled, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.verifyCode')}</Text>}
        </Pressable>
        <Text style={styles.magicLinkHint}>{t('auth.magicLinkHint')}</Text>
        {hasLiveTransaction ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resend()} style={styles.linkButton}>
            <Text style={styles.linkText}>{t('auth.resendEmail')}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.back()} style={styles.linkButton}>
          <Text style={styles.secondaryLinkText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, maxWidth: 440, padding: 26, width: '100%' },
  icon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 18, textAlign: 'center' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: 5, marginTop: 24, minHeight: 56, paddingHorizontal: 16, textAlign: 'center', width: '100%' },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, justifyContent: 'center', marginTop: 12, minHeight: 52, padding: 14, width: '100%' },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  magicLinkHint: { color: colors.mutedLight, fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },
  linkButton: { paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  secondaryLinkText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  pressed: { backgroundColor: colors.primaryDark },
});
