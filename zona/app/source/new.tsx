import * as Clipboard from 'expo-clipboard';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useBottomSafePadding } from '@/components/TabScreen';
import { createSource } from '@/lib/api';
import { ensureAndroidSourceNotificationChannel } from '@/lib/android-source-notifications';
import { markSourcesCacheDirty } from '@/hooks/useSources';
import { normalizeOptional, validateSourceInput } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';
import type { CreatedSource } from '@/types';

export default function NewSourceScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session, loading } = useAuth();
  const { t } = useI18n();
  const { snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const bottomPadding = useBottomSafePadding(22);
  const [displayName, setDisplayName] = useState('');
  const [hostname, setHostname] = useState('');
  const [working, setWorking] = useState(false);
  const [created, setCreated] = useState<CreatedSource | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [template, setTemplate] = useState<'agent' | 'curl' | 'powershell' | 'automation'>('agent');

  const curl = useMemo(() => created
    ? `curl -X POST "${created.ingestUrl}" -H "Authorization: Bearer ${created.token}" -H "Idempotency-Key: replace-with-a-unique-event-id" -H "Content-Type: application/json" -d '{"title":"Build complete","body":"The release build finished.","category":"build","severity":"medium"}'`
    : '', [created]);
  const templates = useMemo(() => created ? {
    agent: `Use this Zona source to notify my phone after important work.\nEndpoint: ${created.ingestUrl}\nAuthorization: Bearer ${created.token}\nSend JSON with title, body, optional category, severity (low, medium, high, or critical), and data. Add a unique Idempotency-Key header for each event. Never print or commit the token.`,
    curl,
    powershell: `$headers = @{\n  Authorization = 'Bearer ${created.token}'\n  'Idempotency-Key' = 'event-' + [guid]::NewGuid()\n}\n$body = @{\n  title = 'Task complete'\n  body = 'Your automation finished successfully.'\n  category = 'automation'\n  severity = 'low'\n} | ConvertTo-Json\nInvoke-RestMethod -Method Post -Uri '${created.ingestUrl}' -Headers $headers -ContentType 'application/json' -Body $body`,
    automation: `# GitHub Actions — save the token as ZONA_SOURCE_TOKEN\n- name: Notify Zona\n  if: always()\n  shell: bash\n  run: |\n    curl --fail-with-body -X POST '${created.ingestUrl}' \\\n      -H 'Authorization: Bearer \${{ secrets.ZONA_SOURCE_TOKEN }}' \\\n      -H \"Idempotency-Key: github-\${{ github.run_id }}-\${{ github.run_attempt }}\" \\\n      -H 'Content-Type: application/json' \\\n      -d '{\"title\":\"Workflow finished\",\"body\":\"Check the latest run in GitHub.\",\"category\":\"github\",\"severity\":\"medium\"}'`,
  } : null, [created, curl]);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  const userId = session.user.id;
  if (!created && (!isVisible('sources.create') || !isEnabled('sources.create'))) {
    return (
      <View style={styles.unavailable}>
        <AppIcon color={colors.muted} fallback="×" name="lock.fill" size={27} />
        <Text style={styles.title}>{t('common.unavailable')}</Text>
        <Text style={styles.unavailableBody}>{snapshot.features['sources.create'].reason || t('common.tryAgain')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondary}>
          <Text style={styles.secondaryText}>{t('common.close')}</Text>
        </Pressable>
      </View>
    );
  }

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
      markSourcesCacheDirty(userId);
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
      const result = await response.json() as { error?: string; pushAccepted?: number; pushAttempted?: number; pushQueued?: number };
      if (!response.ok) throw new Error(result.error ?? t('sourceNew.requestFailed', { status: response.status }));
      setTestMessage(result.pushQueued
        ? t('sourceNew.testQueued')
        : result.pushAccepted
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
    // Token is selectable; keep back/Done available so a clipboard failure cannot trap the user.
    return (
      <>
        <Stack.Screen options={{ title: t('sourceNew.saveHeader') }} />
        <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottomPadding }]}>
        <View style={styles.successMark}><AppIcon color={colors.success} fallback="✓" name="checkmark" size={25} /></View>
        <Text style={styles.title}>{t('sourceNew.saveTitle')}</Text>
        <Text style={styles.help}>{t('sourceNew.saveHelp', { name: created.displayName })}</Text>
        <View style={styles.tokenBox}><Text selectable style={styles.token}>{created.token}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void copy(created.token, 'token')} style={styles.primary}><AppIcon color={colors.white} fallback="□" name="doc.on.doc" size={16} /><Text style={styles.primaryText}>{tokenCopied ? t('sourceNew.tokenCopied') : t('sourceNew.copyToken')}</Text></Pressable>
        {copyMessage ? <Text accessibilityLiveRegion="polite" style={styles.copyMessage}>{copyMessage}</Text> : null}
        {isVisible('sources.test') ? <Pressable accessibilityRole="button" disabled={testing || !isEnabled('sources.test')} onPress={() => void sendTestNotification(created)} style={[styles.testButton, (testing || !isEnabled('sources.test')) && styles.disabled]}>
          {testing ? <ActivityIndicator color={colors.accent} /> : <><AppIcon color={colors.accent} fallback="!" name="bell.badge.fill" size={16} /><Text style={styles.testButtonText}>{t('sourceNew.sendTest')}</Text></>}
        </Pressable> : null}
        {testMessage ? <Text accessibilityLiveRegion="polite" style={styles.testMessage}>{testMessage}</Text> : null}
        <Text style={styles.label}>{t('sourceNew.firstAlertTemplates')}</Text>
        <Text style={styles.templateHelp}>{t('sourceNew.firstAlertTemplatesBody')}</Text>
        <ScrollView contentContainerStyle={styles.templateTabs} horizontal showsHorizontalScrollIndicator={false}>
          {(['agent', 'curl', 'powershell', 'automation'] as const).map((choice) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: template === choice }} key={choice} onPress={() => setTemplate(choice)} style={[styles.templateTab, template === choice && styles.templateTabActive]}><Text style={[styles.templateTabText, template === choice && styles.templateTabTextActive]}>{t(`sourceNew.template.${choice}`)}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.codeBox}><Text selectable style={styles.code}>{templates?.[template] ?? ''}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void copy(templates?.[template] ?? '', 'example')} style={styles.secondary}><AppIcon color={colors.primary} fallback="□" name="doc.on.doc" size={15} /><Text style={styles.secondaryText}>{t('sourceNew.copyTemplate')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.done}><Text style={styles.doneText}>{tokenCopied ? t('sourceNew.done') : t('sourceNew.copyToContinue')}</Text></Pressable>
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
        <TextInput accessibilityLabel={t('sourceNew.displayName')} autoFocus maxLength={80} onChangeText={setDisplayName} placeholder={t('sourceNew.displayPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} value={displayName} />
        <Text style={styles.label}>{t('sourceNew.hostname')}</Text>
        <TextInput accessibilityLabel={t('sourceNew.hostname')} autoCapitalize="none" maxLength={255} onChangeText={setHostname} placeholder={t('sourceNew.hostnamePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} value={hostname} />
        <Pressable accessibilityRole="button" disabled={working} onPress={submit} style={[styles.primary, working && styles.disabled]}>
          {working ? <><ActivityIndicator color={colors.white} /><Text style={styles.primaryText}>{t('sourceNew.creating')}</Text></> : <><AppIcon color={colors.white} fallback="+" name="key.fill" size={16} /><Text style={styles.primaryText}>{t('sourceNew.create')}</Text></>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 22 },
  sourceIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 19, height: 58, justifyContent: 'center', marginBottom: 20, width: 58 },
  successMark: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: 27, height: 54, justifyContent: 'center', marginBottom: 18, width: 54 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8 },
  help: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 22 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 7, marginTop: 14 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 16, paddingHorizontal: 15, paddingVertical: 14 },
  // Invariant: a `colors.text` background must always pair with a `colors.background`
  // foreground so inverted code/token surfaces remain readable in every preset
  // (locked by WS3's contrast test).
  tokenBox: { backgroundColor: colors.text, borderRadius: radius.medium, padding: 16 },
  token: { color: colors.background, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, lineHeight: 18 },
  codeBox: { backgroundColor: colors.text, borderRadius: radius.medium, padding: 15 },
  code: { color: colors.background, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 10, lineHeight: 16 },
  templateHelp: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 9 },
  templateTabs: { gap: 7, paddingBottom: 10 },
  templateTab: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: 12 },
  templateTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  templateTabText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  templateTabTextActive: { color: colors.white },
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
  unavailable: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 28 },
  unavailableBody: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 360, textAlign: 'center' },
});
