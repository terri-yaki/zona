import * as Clipboard from 'expo-clipboard';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { LoadingScreen } from '@/components/LoadingScreen';
import { createSource } from '@/lib/api';
import { normalizeOptional, validateSourceInput } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius } from '@/theme';
import type { CreatedSource } from '@/types';

export default function NewSourceScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [hostname, setHostname] = useState('');
  const [working, setWorking] = useState(false);
  const [created, setCreated] = useState<CreatedSource | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const curl = useMemo(() => created
    ? `curl -X POST "${created.ingestUrl}" -H "Authorization: Bearer ${created.token}" -H "Idempotency-Key: replace-with-a-unique-event-id" -H "Content-Type: application/json" -d '{"title":"Build complete","body":"The release build finished.","category":"build"}'`
    : '', [created]);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  async function copy(value: string, kind: 'token' | 'example') {
    try {
      await Clipboard.setStringAsync(value);
      if (kind === 'token') setTokenCopied(true);
      setCopyMessage(kind === 'token' ? 'Token copied. Keep it in a secure secret store.' : 'cURL example copied.');
    } catch {
      Alert.alert('Could not copy', 'Select the text and copy it manually before leaving this screen.');
    }
  }

  async function submit() {
    const error = validateSourceInput(displayName, hostname);
    if (error) { Alert.alert('Check the source', error); return; }
    setWorking(true);
    try {
      setCreated(await createSource(displayName.trim(), normalizeOptional(hostname)));
    } catch (caught) {
      Alert.alert('Could not create source', caught instanceof Error ? caught.message : 'Try again.');
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
          title: 'Zona is connected',
          body: `This test alert came from ${source.displayName}.`,
          category: 'test',
        }),
      });
      const result = await response.json() as { error?: string; pushAccepted?: number; pushAttempted?: number };
      if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
      setTestMessage(result.pushAccepted
        ? 'Alert accepted and handed to Expo Push Service.'
        : result.pushAttempted
        ? 'Alert saved, but Expo did not accept the push. Check Settings.'
        : 'Alert saved to the inbox. This iPhone has not registered for push yet.');
    } catch (error) {
      Alert.alert('Test alert failed', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setTesting(false);
    }
  }

  if (created) {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false, title: 'Save source token' }} />
        <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.successMark}><AppIcon color={colors.success} fallback="✓" name="checkmark" size={25} /></View>
        <Text style={styles.title}>Save this token now</Text>
        <Text style={styles.help}>Zona stores only a hash, so this token cannot be displayed again. It identifies {created.displayName}.</Text>
        <View style={styles.tokenBox}><Text selectable style={styles.token}>{created.token}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void copy(created.token, 'token')} style={styles.primary}><AppIcon color={colors.white} fallback="□" name="doc.on.doc" size={16} /><Text style={styles.primaryText}>{tokenCopied ? 'Token copied' : 'Copy token'}</Text></Pressable>
        {copyMessage ? <Text accessibilityLiveRegion="polite" style={styles.copyMessage}>{copyMessage}</Text> : null}
        <Pressable accessibilityRole="button" disabled={testing} onPress={() => void sendTestNotification(created)} style={[styles.testButton, testing && styles.disabled]}>
          {testing ? <ActivityIndicator color={colors.accent} /> : <><AppIcon color={colors.accent} fallback="!" name="bell.badge.fill" size={16} /><Text style={styles.testButtonText}>Send test alert</Text></>}
        </Pressable>
        {testMessage ? <Text accessibilityLiveRegion="polite" style={styles.testMessage}>{testMessage}</Text> : null}
        <Text style={styles.label}>EXAMPLE REQUEST</Text>
        <View style={styles.codeBox}><Text selectable style={styles.code}>{curl}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void copy(curl, 'example')} style={styles.secondary}><AppIcon color={colors.primary} fallback="□" name="doc.on.doc" size={15} /><Text style={styles.secondaryText}>Copy cURL example</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!tokenCopied} onPress={() => router.back()} style={[styles.done, !tokenCopied && styles.disabled]}><Text style={styles.doneText}>{tokenCopied ? 'I saved it — Done' : 'Copy the token to continue'}</Text></Pressable>
        </ScrollView>
      </>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.sourceIcon}><AppIcon color={colors.primary} fallback="□" name="desktopcomputer" size={29} /></View>
        <Text style={styles.title}>Name this source</Text>
        <Text style={styles.help}>Create one source for every PC or local application. The source name is attached by the server to prevent spoofing.</Text>
        <Text style={styles.label}>DISPLAY NAME</Text>
        <TextInput autoFocus maxLength={80} onChangeText={setDisplayName} placeholder="e.g. Office PC" placeholderTextColor={colors.muted} style={styles.input} value={displayName} />
        <Text style={styles.label}>HOSTNAME (OPTIONAL)</Text>
        <TextInput autoCapitalize="none" maxLength={255} onChangeText={setHostname} placeholder="e.g. OFFICE-01" placeholderTextColor={colors.muted} style={styles.input} value={hostname} />
        <Pressable accessibilityRole="button" disabled={working} onPress={submit} style={[styles.primary, working && styles.disabled]}>
          {working ? <ActivityIndicator color={colors.white} /> : <><AppIcon color={colors.white} fallback="+" name="key.fill" size={16} /><Text style={styles.primaryText}>Create private token</Text></>}
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
