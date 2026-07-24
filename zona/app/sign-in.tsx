import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';

export default function SignInScreen() {
  const { session, authError, clearAuthError } = useAuth();
  const { t } = useI18n();
  const [signingIn, setSigningIn] = useState(false);

  if (session) return <Redirect href="/" />;

  async function continueAnonymously() {
    setSigningIn(true);
    clearAuthError();
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
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
            <Pressable accessibilityRole="button" disabled={signingIn} onPress={continueAnonymously} style={({ pressed }) => [styles.button, signingIn && styles.disabled, pressed && styles.pressed]}>
              {signingIn ? <ActivityIndicator color={colors.white} /> : <><Text style={styles.buttonText}>{t('common.continue')}</Text><AppIcon color={colors.white} fallback="›" name="arrow.right" size={17} /></>}
            </Pressable>
            <Text style={styles.privacy}>{t('auth.privateAccount')}</Text>
          </View>
          {authError ? <View accessibilityLiveRegion="polite" style={styles.errorBox}><AppIcon color={colors.danger} fallback="!" name="exclamationmark.triangle.fill" size={17} /><Text style={styles.errorText}>{authError}</Text></View> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 53, padding: 14 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  pressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.6 },
  privacy: { color: colors.mutedLight, fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'center' },
  errorBox: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 8, marginTop: 14, padding: 12 },
  errorText: { color: colors.danger, flex: 1, fontSize: 12, lineHeight: 17 },
});
