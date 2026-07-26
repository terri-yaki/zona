import * as Clipboard from 'expo-clipboard';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useBottomSafePadding } from '@/components/TabScreen';
import { createSource } from '@/lib/api';
import { ensureAndroidSourceNotificationChannel } from '@/lib/android-source-notifications';
import { normalizeOptional, validateSourceInput } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import type { CreatedSource } from '@/types';

export default function NewSourceScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { t } = useI18n();
  const bottomPadding = useBottomSafePadding(22);
  const [displayName, setDisplayName] = useState('');
  const [hostname, setHostname] = useState('');
  const [working, setWorking] = useState(false);
  const [created, setCreated] = useState<CreatedSource | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const curl = useMemo(() => created
    ? `curl -X POST "${created.ingestUrl}" -H "Authorization: Bearer ${created.token}" -H "Idempotency-Key: replace-with-a-unique-event-id" -H "Content-Type: application/json" -d '{"title":"Build complete","body":"The release build finished.","category":"build","severity":"medium"}'`
    : '', [created]);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  async function copy(value: string, kind: 'token' | 'example') {
    try {
      await Clipboard.setStringAsync(value);
      if (kind === 'token') setTokenCopied(true);
      setCopyMessage(kind === 'token' ? t('sourceNew.tokenCopiedMessage') : t('sourceNew.curlCopiedMessage'));
    } catch {
      Alert.alert(t('sourceNew.copyErrorTitle'), t('sourceNew.copyErrorBody'));
    }
  }

  async function submit() {
    const error = validateSourceInput(displayName, hostname);
    if (error) { Alert.alert(t('sourceNew.checkSource'), error); return; }
    setWorking(true);
    try {
      const next = await createSource(displayName.trim(), normalizeOptional(hostname));
      setCreated(next);
      void ensureAndroidSourceNotificationChannel(next.sourceId, next.displayName).catch((channelError) => {
        console.warn('Could not create the Android source notification channel.', channelError);
      });
    } catch (caught) {
      Alert.alert(t('sourceNew.createError'), caught instanceof Error ? caught.message : t('common.tryAgain'));
    } finally {
      setWorking(false);
    }
  }

  async function sendTestNotification(source: CreatedSource) {
    setTesting(true);
    setTestMessage(null);
    try {
      const response = await fetch(source.ingestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${source.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `iphone-test-${Date.now()}`,
        },
        body: JSON.stringify({
          title: t('sourceNew.testConnectedTitle'),
          body: t('sourceNew.testConnectedBody', { name: source.displayName }),
          category: 'test',
        }),
      });
      const result = await response.json() as { error?: string; pushAccepted?: number; pushAttempted?: number };
      if (!response.ok) throw new Error(result.error ?? t('sourceNew.requestFailed', { status: response.status }));
      setTestMessage(result.pushAccepted
        ? t('sourceNew.testAccepted')
        : result.pushAttempted
        ? t('sourceNew.testRejected')
        : t('sourceNew.testInboxOnly'));
    } catch (error) {
      Alert.alert(t('sourceNew.testError'), error instanceof Error ? error.message : t('error.connection'));
    } finally {
      setTesting(false);
    }
  }

  if (created) {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false, title: t('sourceNew.saveHeader') }} />
        <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottomPadding }]}>
        <View style={styles.successMark}><AppIcon color={colors.success} fallback="✓" name="checkmark" size={25} /></View>
        <Text style={styles.title}>{t('sourceNew.saveTitle')}</Text>
        <Text style={styles.help}>{t('sourceNew.saveHelp', { name: created.displayName })}</Text>
        <View style={styles.tokenBox}><Text selectable style={styles.token}>{created.token}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void copy(created.token, 'token')} style={styles.primary}><AppIcon color={colors.white} fallback="□" name="doc.on.doc" size={16} /><Text style={styles.primaryText}>{tokenCopied ? t('sourceNew.tokenCopied') : t('sourceNew.copyToken')}</Text></Pressable>
        {copyMessage ? <Text accessibilityLiveRegion="polite" style={styles.copyMessage}>{copyMessage}</Text> : null}
        <Pressable accessibilityRole="button" disabled={testing} onPress={() => void sendTestNotification(created)} style={[styles.testButton, testing && styles.disabled]}>
          {testing ? <ActivityIndicator color={colors.accent} /> : <><AppIcon color={colors.accent} fallback="!" name="bell.badge.fill" size={16} /><Text style={styles.testButtonText}>{t('sourceNew.sendTest')}</Text></>}
        </Pressable>
        {testMessage ? <Text accessibilityLiveRegion="polite" style={styles.testMessage}>{testMessage}</Text> : null}
        <Text style={styles.label}>{t('sourceNew.exampleRequest')}</Text>
        <View style={styles.codeBox}><Text selectable style={styles.code}>{curl}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void copy(curl, 'example')} style={styles.secondary}><AppIcon color={colors.primary} fallback="□" name="doc.on.doc" size={15} /><Text style={styles.secondaryText}>{t('sourceNew.copyCurl')}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!tokenCopied} onPress={() => router.back()} style={[styles.done, !tokenCopied && styles.disabled]}><Text style={styles.doneText}>{tokenCopied ? t('sourceNew.done') : t('sourceNew.copyToContinue')}</Text></Pressable>
        </ScrollView>
      </>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottomPadding }]} keyboardShouldPersistTaps="handled">
        <View style={styles.sourceIcon}><AppIcon color={colors.primary} fallback="□" name="desktopcomputer" size={29} /></View>
        <Text style={styles.title}>{t('sourceNew.nameTitle')}</Text>
        <Text style={styles.help}>{t('sourceNew.nameHelp')}</Text>
        <Text style={styles.label}>{t('sourceNew.displayName')}</Text>
        <TextInput autoFocus maxLength={80} onChangeText={setDisplayName} placeholder={t('sourceNew.displayPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} value={displayName} />
        <Text style={styles.label}>{t('sourceNew.hostname')}</Text>
        <TextInput autoCapitalize="none" maxLength={255} onChangeText={setHostname} placeholder={t('sourceNew.hostnamePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} value={hostname} />
        <Pressable accessibilityRole="button" disabled={working} onPress={submit} style={[styles.primary, working && styles.disabled]}>
          {working ? <><ActivityIndicator color={colors.white} /><Text style={styles.primaryText}>{t('sourceNew.creating')}</Text></> : <><AppIcon color={colors.white} fallback="+" name="key.fill" size={16} /><Text style={styles.primaryText}>{t('sourceNew.create')}</Text></>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 22 },
  sourceIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 19, height: 58, justifyContent: 'center', marginBottom: 20, width: 58 },
  successMark: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: 27, height: 54, justifyContent: 'center', marginBottom: 18, width: 54 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8 },
  help: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 22 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 7, marginTop: 14 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 16, paddingHorizontal: 15, paddingVertical: 14 },
  tokenBox: { backgroundColor: colors.text, borderRadius: radius.medium, padding: 16 },
  token: { color: '#DDECE6', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, lineHeight: 18 },
  codeBox: { backgroundColor: colors.text, borderRadius: radius.medium, padding: 15 },
  code: { color: '#E7ECE9', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 10, lineHeight: 16 },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 16, minHeight: 52, padding: 14 },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondary: { alignItems: 'center', borderColor: colors.primary, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 10, padding: 13 },
  secondaryText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  testButton: { alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 12, minHeight: 48, padding: 13 },
  testButtonText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  testMessage: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, textAlign: 'center' },
  done: { alignItems: 'center', padding: 18 },
  doneText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  copyMessage: { color: colors.success, fontSize: 12, fontWeight: '600', lineHeight: 18, marginTop: 10, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
