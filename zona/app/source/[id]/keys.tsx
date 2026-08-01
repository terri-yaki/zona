import * as Clipboard from 'expo-clipboard';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useBottomSafePadding } from '@/components/TabScreen';
import { useSourceAccessKeys } from '@/hooks/useSourceAccessKeys';
import { createSourceAccessKey, manageSourceAccessKey } from '@/lib/api';
import { userMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius, shadows } from '@/theme';
import type { CreatedSourceAccessKey, SourceAccessKey } from '@/types';

type Editor = { mode: 'add'; key: null } | { mode: 'rename'; key: SourceAccessKey };

export default function SourceKeysScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; revoked?: string }>();
  const sourceId = typeof params.id === 'string' ? params.id : null;
  const sourceName = typeof params.name === 'string' ? params.name : '';
  const sourceRevoked = params.revoked === 'true';
  const { loading: authLoading, session } = useAuth();
  const { t } = useI18n();
  const bottomPadding = useBottomSafePadding(24);
  const { error, keys, load, loading, refresh, refreshing } = useSourceAccessKeys(sourceId);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedSourceAccessKey | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  if (authLoading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  function openAdd() {
    setEditorValue('');
    setEditor({ mode: 'add', key: null });
  }

  function openRename(key: SourceAccessKey) {
    setEditorValue(key.name);
    setEditor({ mode: 'rename', key });
  }

  async function saveEditor() {
    if (!sourceId || !editor || saving || (sourceRevoked && editor.mode === 'add')) return;
    const label = editorValue.trim();
    if (!label) return;
    setSaving(true);
    try {
      if (editor.mode === 'add') {
        const next = await createSourceAccessKey(sourceId, label);
        setCreated(next);
        setTokenCopied(false);
      } else {
        await manageSourceAccessKey(editor.key.id, 'rename', { keyLabel: label });
      }
      setEditor(null);
      await load();
    } catch (caught) {
      Alert.alert(t('sourceKeys.saveError'), userMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(key: SourceAccessKey, isActive: boolean) {
    if (busyKeyId || key.revoked_at) return;
    setBusyKeyId(key.id);
    try {
      await manageSourceAccessKey(key.id, 'set_active', { isActive });
      await load();
    } catch (caught) {
      Alert.alert(t('sourceKeys.updateError'), userMessage(caught));
    } finally {
      setBusyKeyId(null);
    }
  }

  function askRevoke(key: SourceAccessKey) {
    if (busyKeyId || key.revoked_at) return;
    Alert.alert(
      t('sourceKeys.revokeTitle'),
      t('sourceKeys.revokeBody', { name: key.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sources.revoke'),
          style: 'destructive',
          onPress: async () => {
            setBusyKeyId(key.id);
            try {
              await manageSourceAccessKey(key.id, 'revoke');
              await load();
            } catch (caught) {
              Alert.alert(t('sourceKeys.updateError'), userMessage(caught));
            } finally {
              setBusyKeyId(null);
            }
          },
        },
      ],
    );
  }

  async function copyToken() {
    if (!created) return;
    try {
      await Clipboard.setStringAsync(created.token);
      setTokenCopied(true);
    } catch (caught) {
      Alert.alert(t('sourceKeys.copyError'), userMessage(caught));
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: sourceName || t('sourceKeys.title') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={colors.primary} />}
      >
        <View style={styles.introRow}>
          <View style={styles.introCopy}>
            <Text style={styles.title}>{t('sourceKeys.title')}</Text>
            <Text style={styles.subtitle}>{t('sourceKeys.subtitle')}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={sourceRevoked} onPress={openAdd} style={({ pressed }) => [styles.addButton, sourceRevoked && styles.disabled, pressed && styles.pressed]}>
            <AppIcon color={colors.white} fallback="+" name="plus" size={17} />
            <Text style={styles.addText}>{t('sourceKeys.add')}</Text>
          </Pressable>
        </View>

        {sourceRevoked ? <Text style={styles.revokedNotice}>{t('sourceKeys.sourceRevoked')}</Text> : null}

        {loading && keys.length === 0 ? <LoadingScreen /> : null}
        {error ? <ErrorState compact error={error} onRetry={() => void load()} /> : null}
        {!loading && !error && keys.length === 0 ? (
          <EmptyState title={t('sourceKeys.emptyTitle')} message={t('sourceKeys.emptyBody')} />
        ) : null}

        <View style={styles.list}>
          {keys.map((key) => {
            const revoked = Boolean(key.revoked_at);
            const busy = busyKeyId === key.id;
            return (
              <View key={key.id} style={[styles.card, revoked && styles.revokedCard]}>
                <View style={styles.cardTop}>
                  <View style={styles.keyIcon}>
                    <AppIcon color={revoked ? colors.mutedLight : colors.primary} fallback="K" name="key.fill" size={18} />
                  </View>
                  <View style={styles.keyCopy}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.keyName}>{key.name}</Text>
                      {revoked ? <Text style={styles.revokedPill}>{t('sources.revoked')}</Text> : null}
                      {!revoked && !key.is_active ? <Text style={styles.pausedPill}>{t('sources.paused')}</Text> : null}
                    </View>
                    <Text style={styles.prefix}>{key.key_prefix ? `${key.key_prefix}…` : t('sources.protectedKey')}</Text>
                    <Text style={styles.meta}>
                      {key.last_used_at
                        ? t('sourceKeys.lastUsed', { time: relativeTime(key.last_used_at) })
                        : t('sourceKeys.neverUsed')}
                    </Text>
                  </View>
                  {busy ? <ActivityIndicator color={colors.primary} size="small" /> : (
                    <Switch
                      accessibilityLabel={t('sourceKeys.activeA11y', { name: key.name })}
                      disabled={revoked || Boolean(busyKeyId)}
                      onValueChange={(value) => void setActive(key, value)}
                      trackColor={{ false: colors.border, true: colors.primarySoft }}
                      thumbColor={key.is_active && !revoked ? colors.primary : colors.mutedLight}
                      value={key.is_active && !revoked}
                    />
                  )}
                </View>
                {!revoked ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" disabled={Boolean(busyKeyId)} onPress={() => openRename(key)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                      <AppIcon color={colors.primary} fallback="E" name="pencil" size={13} />
                      <Text style={styles.actionText}>{t('sources.rename')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={Boolean(busyKeyId)} onPress={() => askRevoke(key)} style={({ pressed }) => [styles.action, styles.dangerAction, pressed && styles.pressed]}>
                      <AppIcon color={colors.danger} fallback="X" name="xmark.circle" size={13} />
                      <Text style={styles.dangerText}>{t('sources.revoke')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <KeyEditorModal
        busy={saving}
        mode={editor?.mode ?? 'add'}
        onChange={setEditorValue}
        onClose={() => { if (!saving) setEditor(null); }}
        onSubmit={() => void saveEditor()}
        value={editorValue}
        visible={Boolean(editor)}
      />
      <NewKeyModal
        copied={tokenCopied}
        created={created}
        onClose={() => { if (tokenCopied) setCreated(null); }}
        onCopy={() => void copyToken()}
      />
    </View>
  );
}

function KeyEditorModal({ busy, mode, onChange, onClose, onSubmit, value, visible }: {
  busy: boolean;
  mode: 'add' | 'rename';
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  value: string;
  visible: boolean;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalRoot}>
        <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
          <Text style={styles.sheetTitle}>{mode === 'add' ? t('sourceKeys.addTitle') : t('sourceKeys.renameTitle')}</Text>
          <Text style={styles.sheetBody}>{t('sourceKeys.labelHelp')}</Text>
          <TextInput
            accessibilityLabel={mode === 'add' ? t('sourceKeys.addTitle') : t('sourceKeys.renameTitle')}
            autoFocus
            maxLength={80}
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            placeholder={t('sourceKeys.labelPlaceholder')}
            placeholderTextColor={colors.mutedLight}
            style={styles.input}
            value={value}
          />
          <Pressable accessibilityRole="button" disabled={busy || !value.trim()} onPress={onSubmit} style={[styles.submit, (busy || !value.trim()) && styles.disabled]}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>{t('sourceKeys.save')}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function NewKeyModal({ copied, created, onClose, onCopy }: {
  copied: boolean;
  created: CreatedSourceAccessKey | null;
  onClose: () => void;
  onCopy: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(created)}>
      <View style={styles.modalRoot}>
        <View style={[styles.secretSheet, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
          <View style={styles.secretIcon}><AppIcon color={colors.primary} fallback="K" name="key.fill" size={25} /></View>
          <Text style={styles.sheetTitle}>{t('sourceKeys.saveTitle')}</Text>
          <Text style={styles.sheetBody}>{t('sourceKeys.saveBody')}</Text>
          <Text selectable style={styles.token}>{created?.token ?? ''}</Text>
          <Pressable accessibilityRole="button" onPress={onCopy} style={styles.submit}>
            <AppIcon color={colors.white} fallback="C" name="doc.on.doc" size={15} />
            <Text style={styles.submitText}>{copied ? t('sourceKeys.copied') : t('sourceKeys.copy')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!copied} onPress={onClose} style={[styles.done, !copied && styles.disabled]}>
            <Text style={styles.doneText}>{copied ? t('sourceKeys.done') : t('sourceKeys.copyFirst')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  content: { padding: 20 },
  introRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 14, justifyContent: 'space-between', marginBottom: 20 },
  introCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  addButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.full, flexDirection: 'row', gap: 7, minHeight: 42, paddingHorizontal: 15, ...shadows.floating },
  addText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  revokedNotice: { backgroundColor: colors.dangerSoft, borderRadius: radius.small, color: colors.danger, fontSize: 13, lineHeight: 19, marginBottom: 15, padding: 11 },
  list: { gap: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, padding: 15, ...shadows.card },
  revokedCard: { opacity: 0.5 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  keyIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.small, height: 40, justifyContent: 'center', width: 40 },
  keyCopy: { flex: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  keyName: { color: colors.text, flexShrink: 1, fontSize: 16, fontWeight: '700' },
  prefix: { color: colors.primary, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, marginTop: 4 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  revokedPill: { backgroundColor: colors.dangerSoft, borderRadius: radius.full, color: colors.danger, fontSize: 9, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3 },
  pausedPill: { backgroundColor: colors.surfaceMuted, borderRadius: radius.full, color: colors.muted, fontSize: 9, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3 },
  actions: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end', marginTop: 13 },
  action: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.full, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 12 },
  dangerAction: { backgroundColor: colors.dangerSoft },
  actionText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  dangerText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  modalRoot: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17, 29, 24, 0.38)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 23, width: '100%' },
  secretSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 25, width: '100%' },
  secretIcon: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primarySoft, borderRadius: 20, height: 58, justifyContent: 'center', marginBottom: 14, width: 58 },
  sheetTitle: { color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  sheetBody: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 7, textAlign: 'center' },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 16, marginTop: 18, minHeight: 50, paddingHorizontal: 14 },
  token: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.textSoft, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, lineHeight: 18, marginTop: 18, padding: 14 },
  submit: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 14, minHeight: 50, paddingHorizontal: 16 },
  submitText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  done: { alignItems: 'center', justifyContent: 'center', marginTop: 9, minHeight: 45 },
  doneText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
