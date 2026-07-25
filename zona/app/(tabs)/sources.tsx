import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TabScreen, useTabBarContentPadding } from '@/components/TabScreen';
import { setApiKeySound } from '@/data/sources';
import { useSources } from '@/hooks/useSources';
import { renameSource, revokeSource, setSourceActive, testSource } from '@/lib/api';
import { relativeTime, sourceInitial } from '@/lib/format';
import { userMessage } from '@/lib/errors';
import {
  SOUND_CHOICES as soundChoices,
  soundDescriptionKeys,
  soundLabelKeys,
} from '@/lib/notification-sound-map';
import { previewNotificationSound } from '@/lib/notification-sounds';
import { validateSourceInput } from '@/lib/validation';
import { colors, radius, shadows } from '@/theme';
import type { ApiKey, Source } from '@/types';
import { useI18n } from '@/providers/LocalizationProvider';
import type { SFSymbol } from 'expo-symbols';

type SoundName = ApiKey['sound_name'];

/** Row glyphs; anything not listed falls back to the generic speaker icon. */
const soundGlyphs: Partial<Record<SoundName, { name: SFSymbol; fallback: string }>> = {
  silent: { name: 'speaker.slash.fill', fallback: '∅' },
  'native-notification': { name: 'bell.fill', fallback: '🔔' },
  'native-alarm': { name: 'alarm.fill', fallback: '⏰' },
  'native-ringtone': { name: 'phone.fill', fallback: '📞' },
};

function recentlyActive(lastSeenAt: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1_000;
}

export default function SourcesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { error, load, loading, patchSource, refresh, refreshing, sources } = useSources(true);
  const bottomPad = useTabBarContentPadding();
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [soundPickerSource, setSoundPickerSource] = useState<Source | null>(null);

  function askRename(source: Source) {
    if (busySourceId) return;
    Alert.prompt(
      t('sources.renameTitle'),
      t('sources.renameBody'),
      async (name) => {
        const normalized = name.trim();
        if (!normalized || normalized === source.display_name) return;
        const validationError = validateSourceInput(normalized, source.hostname ?? '');
        if (validationError) {
          Alert.alert(t('sources.nameError'), validationError);
          return;
        }

        setBusySourceId(source.id);
        try {
          await renameSource(source.id, normalized);
          await load();
        } catch (caught) {
          Alert.alert(t('sources.renameError'), userMessage(caught));
        } finally {
          setBusySourceId(null);
        }
      },
      'plain-text',
      source.display_name,
    );
  }

  function askRevoke(source: Source) {
    if (busySourceId) return;
    Alert.alert(
      t('sources.revokeTitle'),
      t('sources.revokeBody', { name: source.display_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sources.revoke'),
          style: 'destructive',
          onPress: async () => {
            setBusySourceId(source.id);
            try {
              await revokeSource(source.id);
              await load();
            } catch (caught) {
              Alert.alert(t('sources.revokeError'), userMessage(caught));
            } finally {
              setBusySourceId(null);
            }
          },
        },
      ],
    );
  }

  async function toggleActive(source: Source, isActive: boolean) {
    if (busySourceId || source.revoked_at) return;
    setBusySourceId(source.id);
    try {
      await setSourceActive(source.id, isActive);
      await load();
    } catch (caught) {
      Alert.alert(t('sources.updateKeyError'), userMessage(caught));
    } finally {
      setBusySourceId(null);
    }
  }

  async function updateSound(source: Source, soundName: SoundName) {
    if (busySourceId || !source.api_key) return;
    const previousSound = source.api_key.sound_name;
    // Optimistic UI — full list reload made ringtone changes feel stuck on slow tunnel/network.
    patchSource(source.id, (current) => (
      current.api_key
        ? { ...current, api_key: { ...current.api_key, sound_name: soundName, updated_at: new Date().toISOString() } }
        : current
    ));
    setBusySourceId(source.id);
    try {
      await setApiKeySound(source.api_key.id, soundName);
    } catch (caught) {
      patchSource(source.id, (current) => (
        current.api_key
          ? { ...current, api_key: { ...current.api_key, sound_name: previousSound } }
          : current
      ));
      Alert.alert(t('sources.soundError'), userMessage(caught));
    } finally {
      setBusySourceId(null);
    }
  }

  function askSound(source: Source) {
    if (busySourceId || !source.api_key) return;
    setSoundPickerSource(source);
  }

  function selectSound(soundName: SoundName) {
    const source = soundPickerSource;
    setSoundPickerSource(null);
    if (!source) return;
    // Local preview verifies the .wav is in this IPA; remote push uses the same basename.
    void previewNotificationSound(soundName).catch((error) => {
      console.warn('Sound preview failed.', error);
    });
    void updateSound(source, soundName);
  }

  async function sendTest(source: Source) {
    if (busySourceId || !source.api_key?.is_active || source.revoked_at) return;
    setBusySourceId(source.id);
    try {
      const result = await testSource(source.id);
      const message = result.pushAccepted > 0
        ? t('sources.testAccepted')
        : result.pushAttempted > 0
        ? t('sources.testRejected')
        : t('sources.testInboxOnly');
      Alert.alert(t('sources.testSent'), message);
      await load();
    } catch (caught) {
      Alert.alert(t('sources.testError'), userMessage(caught));
    } finally {
      setBusySourceId(null);
    }
  }

  if (loading && sources.length === 0) {
    return (
      <TabScreen>
        <LoadingScreen />
      </TabScreen>
    );
  }

  return (
    <TabScreen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('sources.title')}</Text>
          <Text style={styles.subtitle}>{t('sources.subtitle')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('sources.addA11y')}
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => router.push('/source/new')}
          style={({ pressed }) => [styles.addButtonHit, pressed && styles.addButtonPressed]}
        >
          {/* Background lives on an inner View — Link asChild / Pressable style can drop fills. */}
          <View style={styles.addButton}>
            <AppIcon color={colors.white} fallback="+" name="plus" size={22} />
          </View>
        </Pressable>
      </View>

      {error && sources.length > 0 ? <ErrorState compact error={error} onRetry={() => void load()} /> : null}

      <FlatList
        accessibilityLabel={t('sources.title')}
        contentContainerStyle={[
          sources.length ? styles.list : styles.emptyList,
          { paddingBottom: bottomPad },
        ]}
        data={sources}
        keyExtractor={(item) => item.id}
        style={styles.listSurface}
        ListEmptyComponent={error
          ? <ErrorState error={error} onRetry={() => void load()} />
          : <EmptyState title={t('sources.emptyTitle')} message={t('sources.emptyBody')} />}
        refreshControl={(
          <RefreshControl
            onRefresh={() => void refresh()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        )}
        renderItem={({ item }) => {
          const busy = busySourceId === item.id;
          const online = !item.revoked_at && recentlyActive(item.last_seen_at);
          const keyActive = Boolean(item.api_key?.is_active && !item.revoked_at);
          return (
            <View style={[styles.card, item.revoked_at && styles.revoked]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{sourceInitial(item.display_name)}</Text>
                {online ? <View accessibilityLabel={t('sources.lastActive', { time: relativeTime(item.last_seen_at!) })} accessible style={styles.onlineDot} /> : null}
              </View>
              <View style={styles.content}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{item.display_name}</Text>
                  {item.revoked_at ? <Text style={styles.revokedLabel}>{t('sources.revoked')}</Text> : null}
                  {!item.revoked_at && !keyActive ? <Text style={styles.pausedLabel}>{t('sources.paused')}</Text> : null}
                  {busy ? <ActivityIndicator accessibilityLabel={t('settings.checking')} color={colors.primary} size="small" /> : null}
                  {!item.revoked_at ? (
                    <Pressable
                      accessibilityLabel={`${t('sources.rename')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      hitSlop={6}
                      onPress={() => askRename(item)}
                      style={({ pressed }) => [styles.renameIconButton, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.primary} fallback="✎" name="pencil" size={14} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <AppIcon color={colors.mutedLight} fallback="•" name="desktopcomputer" size={12} />
                  <Text numberOfLines={1} style={styles.meta}>{item.hostname || t('sources.hostnameMissing')}</Text>
                </View>
                <Text style={styles.lastSeen}>
                  {item.last_seen_at ? t('sources.lastActive', { time: relativeTime(item.last_seen_at) }) : t('sources.waitingFirst')}
                </Text>
                <View style={styles.keyRow}>
                  <View style={styles.keyCopy}>
                    <Text style={styles.keyLabel}>{t('sources.apiKey')}</Text>
                    <Text style={styles.keyPrefix}>{item.api_key?.key_prefix ? `${item.api_key.key_prefix}…` : t('sources.protectedKey')}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={`${t('sources.apiKey')} ${item.display_name}`}
                    disabled={Boolean(busySourceId) || Boolean(item.revoked_at)}
                    onValueChange={(value) => void toggleActive(item, value)}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={keyActive ? colors.primary : colors.mutedLight}
                    value={keyActive}
                  />
                </View>
                {!item.revoked_at ? (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityLabel={`${t('sources.test')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) || !keyActive }}
                      disabled={Boolean(busySourceId) || !keyActive}
                      onPress={() => void sendTest(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionPrimary, pressed && styles.actionPressed, !keyActive && styles.actionDisabled]}
                    >
                      <AppIcon color={colors.accent} fallback="!" name="bell.badge.fill" size={12} />
                      <Text style={[styles.action, styles.testAction]}>{t('sources.test')}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${t('sources.soundTitle')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      onPress={() => askSound(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionFlex, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.primary} fallback="♪" name="speaker.wave.2.fill" size={12} />
                      <Text numberOfLines={1} style={styles.action}>{t(soundLabelKeys[item.api_key?.sound_name ?? 'default'])}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${t('sources.revoke')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      onPress={() => askRevoke(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionDanger, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.danger} fallback="×" name="xmark.circle" size={12} />
                      <Text style={[styles.action, styles.danger]}>{t('sources.revoke')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <SoundPickerModal
        current={soundPickerSource?.api_key?.sound_name ?? 'default'}
        sourceName={soundPickerSource?.display_name ?? ''}
        visible={Boolean(soundPickerSource)}
        onClose={() => setSoundPickerSource(null)}
        onSelect={selectSound}
      />
    </TabScreen>
  );
}

function SoundPickerModal({
  visible,
  sourceName,
  current,
  onClose,
  onSelect,
}: {
  visible: boolean;
  sourceName: string;
  current: SoundName;
  onClose: () => void;
  onSelect: (sound: SoundName) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.sheetBackdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('sources.soundTitle')}</Text>
          <Text style={styles.sheetSubtitle} numberOfLines={2}>
            {t('sources.soundSubtitle', { name: sourceName })}
          </Text>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.sheetList}
            showsVerticalScrollIndicator={false}
            style={styles.sheetScroll}
          >
            {soundChoices.map((choice) => {
              const selected = choice === current;
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(choice)}
                  style={({ pressed }) => [
                    styles.soundRow,
                    selected && styles.soundRowSelected,
                    pressed && styles.soundRowPressed,
                  ]}
                >
                  <View style={[styles.soundGlyph, selected && styles.soundGlyphSelected]}>
                    <AppIcon
                      color={selected ? colors.white : colors.primary}
                      fallback={soundGlyphs[choice]?.fallback ?? '♪'}
                      name={soundGlyphs[choice]?.name ?? 'speaker.wave.2.fill'}
                      size={16}
                    />
                  </View>
                  <View style={styles.soundCopy}>
                    <Text style={[styles.soundLabel, selected && styles.soundLabelSelected]}>{t(soundLabelKeys[choice])}</Text>
                    <Text style={styles.soundDescription}>{t(soundDescriptionKeys[choice])}</Text>
                  </View>
                  {selected ? (
                    <AppIcon color={colors.primary} fallback="✓" name="checkmark.circle.fill" size={20} />
                  ) : (
                    <View style={styles.soundCheckPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.sheetCancel, pressed && styles.actionPressed]}
          >
            <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  listSurface: { backgroundColor: colors.background, flex: 1 },
  addButtonHit: {
    borderRadius: radius.small,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderCurve: 'continuous',
    borderRadius: radius.small,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
    ...Platform.select({
      ios: {
        shadowColor: '#C46F42',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  addButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  list: { flexGrow: 1 },
  emptyList: { flexGrow: 1 },
  card: { ...shadows.card, alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: '#E7ECE9', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 13, marginHorizontal: 16, marginVertical: 6, padding: 15 },
  revoked: { backgroundColor: colors.surfaceMuted },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, height: 48, justifyContent: 'center', position: 'relative', width: 48 },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  onlineDot: { backgroundColor: colors.success, borderColor: colors.surface, borderRadius: radius.full, borderWidth: 3, bottom: -2, height: 14, position: 'absolute', right: -2, width: 14 },
  content: { flex: 1, minWidth: 0 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  name: { color: colors.text, flex: 1, flexShrink: 1, fontSize: 16, fontWeight: '700' },
  renameIconButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 32,
  },
  revokedLabel: { backgroundColor: colors.dangerSoft, borderRadius: radius.full, color: colors.danger, fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 3 },
  pausedLabel: { backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 3 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 5 },
  meta: { color: colors.muted, flex: 1, fontSize: 11 },
  lastSeen: { color: colors.mutedLight, fontSize: 10, marginTop: 3 },
  keyRow: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.small, flexDirection: 'row', marginTop: 9, minHeight: 48, paddingHorizontal: 11, paddingVertical: 7 },
  keyCopy: { flex: 1, minWidth: 0 },
  keyLabel: { color: colors.mutedLight, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  keyPrefix: { color: colors.textSoft, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 10, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginTop: 10 },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  actionPrimary: { flexShrink: 0 },
  actionFlex: { flex: 1, minWidth: 0 },
  actionDanger: { flexShrink: 0 },
  actionPressed: { opacity: 0.62 },
  actionDisabled: { opacity: 0.42 },
  action: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  testAction: { color: colors.accent },
  danger: { color: colors.danger },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(23,34,30,0.42)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    maxHeight: '78%',
    paddingHorizontal: 16,
    paddingTop: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#17382F',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.full,
    height: 4,
    marginBottom: 12,
    width: 40,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sheetSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 12, marginTop: 4 },
  sheetScroll: { flexGrow: 0 },
  sheetList: { gap: 8, paddingBottom: 8 },
  soundRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  soundRowSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  soundRowPressed: { opacity: 0.78 },
  soundGlyph: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  soundGlyphSelected: { backgroundColor: colors.primary },
  soundCopy: { flex: 1, minWidth: 0 },
  soundLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  soundLabelSelected: { color: colors.primaryDark },
  soundDescription: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  soundCheckPlaceholder: { width: 20 },
  sheetCancel: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.medium,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
  },
  sheetCancelText: { color: colors.textSoft, fontSize: 15, fontWeight: '700' },
});
