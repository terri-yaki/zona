import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { completeAuthCallback } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function AuthCallbackScreen() {
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void completeAuthCallback({
      code: first(params.code),
      error: first(params.error) ?? first(params.error_code),
      errorDescription: first(params.error_description),
      tokenHash: first(params.token_hash),
      transactionId: first(params.zona_tx),
      type: first(params.type),
    }).then(() => {
      router.replace('/');
    }).catch(async (callbackError) => {
      if (callbackError instanceof Error && callbackError.message === 'AUTH_TRANSACTION_EXPIRED') {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace('/');
          return;
        }
      }
      setError(callbackError instanceof Error ? callbackError.message : t('auth.callbackFailed'));
    });
  }, [params, router, t]);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <View style={[styles.icon, error ? styles.errorIcon : null]}>
          <AppIcon
            color={error ? colors.danger : colors.primary}
            fallback={error ? '!' : 'Z'}
            name={error ? 'exclamationmark.triangle.fill' : 'shield.lefthalf.filled'}
            size={29}
          />
        </View>
        <Text style={styles.title}>{error ? t('auth.callbackErrorTitle') : t('auth.callbackTitle')}</Text>
        <Text style={styles.body}>{error ?? t('auth.callbackBody')}</Text>
        {error ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-in')} style={styles.button}>
            <Text style={styles.buttonText}>{t('auth.backToSignIn')}</Text>
          </Pressable>
        ) : <ActivityIndicator color={colors.primary} style={styles.spinner} />}
      </View>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, maxWidth: 440, padding: 28, width: '100%' },
  icon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  errorIcon: { backgroundColor: colors.dangerSoft },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 18, textAlign: 'center' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  spinner: { marginTop: 22 },
  button: { backgroundColor: colors.primary, borderRadius: radius.medium, marginTop: 22, minWidth: 180, paddingHorizontal: 18, paddingVertical: 14 },
  buttonText: { color: colors.white, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
