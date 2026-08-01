import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { renameSource, revokeSource, testSource } from '@/lib/api';
import { relativeTime, sourceInitial } from '@/lib/format';
import { userMessage } from '@/lib/errors';
import { openAndroidSourceNotificationSettings } from '@/lib/android-source-notifications';
import {
  isIosToneFile,
  SOUND_CHOICES as soundChoices,
  soundDescriptionKeys,
  soundLabelKeyFor,
  soundLabelKeys,
} from '@/lib/notification-sound-map';
import { previewNotificationSound } from '@/lib/notification-sounds';
import { runtimeNumber } from '@/lib/runtime-controls';
import { filterSources } from '@/lib/source-search';
import { validateSourceInput } from '@/lib/validation';
import { colors, radius, shadows } from '@/theme';
import { useThemedStyles } from '@/theme-preference';
import type { ApiKey, Source } from '@/types';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import type { SFSymbol } from 'expo-symbols';

type SoundName = ApiKey['sound_name'];

type SoundGlyph = { name: SFSymbol; fallback: string };

/** Row glyphs; bundled Zona presets fall back to the generic speaker icon. */
const soundGlyphs: Partial<Record<SoundName, SoundGlyph>> = {
  silent: { name: 'speaker.slash.fill', fallback: '∅' },
};

const iosToneGlyph: SoundGlyph = { name: 'apple.logo', fallback: '♪' };

function soundGlyph(choice: SoundName): SoundGlyph {
  if (soundGlyphs[choice]) return soundGlyphs[choice];
  return isIosToneFile(choice) ? iosToneGlyph : { name: 'speaker.wave.2.fill', fallback: '♪' };
}

function recentlyActive(lastSeenAt: string | null, windowMilliseconds: number) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < windowMilliseconds;
}

export default function SourcesScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { t } = useI18n();
  const { snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const { error, load, loading, patchSource, refresh, refreshing, sources } = useSources(true);
  const bottomPad = useTabBarContentPadding();
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [renameSourceTarget, setRenameSourceTarget] = useState<Source | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameValidationError, setRenameValidationError] = useState<string | null>(null);
  const [soundPickerSource, setSoundPickerSource] = useState<Source | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const onlineWindowMilliseconds = runtimeNumber(snapshot, 'sources.online_window_minutes', 5, 1, 1440) * 60 * 1_000;
  const searchMinimumCount = runtimeNumber(snapshot, 'sources.search_minimum_count', 4, 0, 100);
  const cardSpacing = runtimeNumber(snapshot, 'sources.card_spacing', 6, 2, 12);
  const searchVisible = isVisible('sources.search') && sources.length >= searchMinimumCount;
  const searchEnabled = searchVisible && isEnabled('sources.search');
  const visibleSources = useMemo(() => {
    return filterSources(sources, searchEnabled ? searchQuery : '');
  }, [searchEnabled, searchQuery, sources]);

  function askRename(source: Source) {
    if (busySourceId) return;
    setRenameSourceTarget(source);
    setRenameValue(source.display_name);
    setRenameValidationError(null);
  }

  async function submitRename() {
    const source = renameSourceTarget;
    if (!source || busySourceId) return;
    const normalized = renameValue.trim();
    if (!normalized || normalized === source.display_name) {
      setRenameSourceTarget(null);
      return;
    }
    const validationError = validateSourceInput(normalized, source.hostname ?? '');
    if (validationError) {
      setRenameValidationError(validationError);
      return;
    }

    setBusySourceId(source.id);
    try {
      await renameSource(source.id, normalized);
      patchSource(source.id, (current) => ({
        ...current,
        display_name: normalized,
        api_key: current.api_key ? { ...current.api_key, name: normalized } : null,
      }));
      setRenameSourceTarget(null);
      void load();
    } catch (caught) {
      Alert.alert(t('sources.renameError'), userMessage(caught));
    } finally {
      setBusySourceId(null);
    }
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
              const revokedAt = new Date().toISOString();
              patchSource(source.id, (current) => ({
                ...current,
                revoked_at: revokedAt,
                api_key: current.api_key ? {
                  ...current.api_key,
                  is_active: false,
                  revoked_at: current.api_key.revoked_at ?? revokedAt,
                  updated_at: revokedAt,
                } : null,
              }));
              void load();
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
    if (Platform.OS === 'android') {
      void openAndroidSourceNotificationSettings(source.id, source.display_name).catch((error) => {
        Alert.alert(t('sources.soundError'), userMessage(error));
      });
      return;
    }
    setSoundPickerSource(source);
  }

  function selectSound(soundName: SoundName) {
    const source = soundPickerSource;
    setSoundPickerSource(null);
    if (!source) return;
    // iOS previews the bundled file; Android sound choices live in its native channel settings.
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
      patchSource(source.id, (current) => ({ ...current, last_seen_at: new Date().toISOString() }));
      void load();
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
        {isVisible('sources.create') ? <Pressable
          accessibilityLabel={t('sources.addA11y')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isEnabled('sources.create') }}
          disabled={!isEnabled('sources.create')}
          hitSlop={4}
          onPress={() => router.push('/source/new')}
          style={({ pressed }) => [styles.addButtonHit, !isEnabled('sources.create') && styles.actionDisabled, pressed && styles.addButtonPressed]}
        >
          {/* Background lives on an inner View — Link asChild / Pressable style can drop fills. */}
          <View style={styles.addButton}>
            <AppIcon color={colors.white} fallback="+" name="plus" size={22} />
          </View>
        </Pressable> : null}
      </View>

      {searchVisible ? (
        <View style={[styles.searchBox, !searchEnabled && styles.actionDisabled]}>
          <AppIcon color={colors.mutedLight} fallback="S" name="magnifyingglass" size={16} />
          <TextInput
            accessibilityLabel={t('sources.searchA11y')}
            autoCapitalize="none"
            autoCorrect={false}
            editable={searchEnabled}
            onChangeText={setSearchQuery}
            placeholder={t('sources.searchPlaceholder')}
            placeholderTextColor={colors.mutedLight}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchEnabled ? searchQuery : ''}
          />
          {searchEnabled && searchQuery ? (
            <Pressable accessibilityLabel={t('sources.clearSearch')} accessibilityRole="button" hitSlop={8} onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <AppIcon color={colors.muted} fallback="x" name="xmark.circle.fill" size={17} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error && sources.length > 0 ? <ErrorState compact error={error} onRetry={() => void load()} /> : null}

      <FlatList
        accessibilityLabel={t('sources.title')}
        contentContainerStyle={[
          visibleSources.length ? styles.list : styles.emptyList,
          { paddingBottom: bottomPad },
        ]}
        data={visibleSources}
        keyExtractor={(item) => item.id}
        style={styles.listSurface}
        ListEmptyComponent={error
          ? <ErrorState error={error} onRetry={() => void load()} />
          : searchQuery
            ? <EmptyState title={t('sources.searchEmptyTitle')} message={t('sources.searchEmptyBody')} />
            : <EmptyState title={t('sources.emptyTitle')} message={t('sources.emptyBody')} />}
        refreshControl={isVisible('sources.pull_to_refresh') && isEnabled('sources.pull_to_refresh') ? (
          <RefreshControl
            onRefresh={() => void refresh()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        ) : undefined}
        renderItem={({ item }) => {
          const busy = busySourceId === item.id;
          const online = !item.revoked_at && recentlyActive(item.last_seen_at, onlineWindowMilliseconds);
          const keyActive = Boolean(item.api_key?.is_active && !item.revoked_at);
          return (
            <View style={[styles.card, { marginVertical: cardSpacing }, item.revoked_at && styles.revoked]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{sourceInitial(item.display_name)}</Text>
                {online && isVisible('sources.status_badges') && isEnabled('sources.status_badges') ? <View accessibilityLabel={t('sources.lastActive', { time: relativeTime(item.last_seen_at!) })} accessible style={styles.onlineDot} /> : null}
              </View>
              <View style={styles.content}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{item.display_name}</Text>
                  {isVisible('sources.status_badges') && item.revoked_at ? <Text style={styles.revokedLabel}>{t('sources.revoked')}</Text> : null}
                  {isVisible('sources.status_badges') && !item.revoked_at && !keyActive ? <Text style={styles.pausedLabel}>{t('sources.paused')}</Text> : null}
                  {busy ? <ActivityIndicator accessibilityLabel={t('settings.checking')} color={colors.primary} size="small" /> : null}
                  {!item.revoked_at && isVisible('sources.rename') ? (
                    <Pressable
                      accessibilityLabel={`${t('sources.rename')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) || !isEnabled('sources.rename') }}
                      disabled={Boolean(busySourceId) || !isEnabled('sources.rename')}
                      hitSlop={6}
                      onPress={() => askRename(item)}
                      style={({ pressed }) => [styles.renameIconButton, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.primary} fallback="✎" name="pencil" size={14} />
                    </Pressable>
                  ) : null}
                </View>
                {isVisible('sources.hostname') ? <View style={styles.metaRow}>
                  <AppIcon color={colors.mutedLight} fallback="•" name="desktopcomputer" size={12} />
                  <Text numberOfLines={1} style={styles.meta}>{item.hostname || t('sources.hostnameMissing')}</Text>
                </View> : null}
                {isVisible('sources.last_seen') ? <Text style={styles.lastSeen}>
                  {item.last_seen_at ? t('sources.lastActive', { time: relativeTime(item.last_seen_at) }) : t('sources.waitingFirst')}
                </Text> : null}
                <Pressable
                  accessibilityLabel={t('sourceKeys.manageFor', { name: item.display_name })}
                  accessibilityRole="button"
                  onPress={() => router.push({
                    pathname: '/source/[id]/keys',
                    params: { id: item.id, name: item.display_name, revoked: item.revoked_at ? 'true' : 'false' },
                  } as never)}
                  style={({ pressed }) => [styles.keyRow, pressed && styles.actionPressed]}
                >
                  <View style={styles.keyCopy}>
                    <Text style={styles.keyLabel}>{t('sourceKeys.manage')}</Text>
                    <Text style={styles.keyPrefix}>{item.api_key?.key_prefix ? `${item.api_key.key_prefix}…` : t('sources.protectedKey')}</Text>
                  </View>
                  <AppIcon color={colors.primary} fallback=">" name="chevron.right" size={13} />
                </Pressable>
                {!item.revoked_at ? (
                  <View style={styles.actions}>
                    {isVisible('sources.test') ? <Pressable
                      accessibilityLabel={`${t('sources.test')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) || !keyActive || !isEnabled('sources.test') }}
                      disabled={Boolean(busySourceId) || !keyActive || !isEnabled('sources.test')}
                      onPress={() => void sendTest(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionPrimary, pressed && styles.actionPressed, (!keyActive || !isEnabled('sources.test')) && styles.actionDisabled]}
                    >
                      <AppIcon color={colors.accent} fallback="!" name="bell.badge.fill" size={12} />
                      <Text style={[styles.action, styles.testAction]}>{t('sources.test')}</Text>
                    </Pressable> : null}
                    {isVisible('sources.sound') ? <Pressable
                      accessibilityLabel={`${t('sources.soundTitle')} ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) || !isEnabled('sources.sound') }}
                      disabled={Boolean(busySourceId) || !isEnabled('sources.sound')}
                      onPress={() => askSound(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionFlex, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.primary} fallback="♪" name="speaker.wave.2.fill" size={12} />
                      <Text numberOfLines={1} style={styles.action}>
                        {Platform.OS === 'android' ? t('sources.soundAndroid') : t(soundLabelKeyFor(item.api_key?.sound_name))}
                      </Text>
                    </Pressable> : null}
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
      <RenameSourceModal
        busy={Boolean(renameSourceTarget && busySourceId === renameSourceTarget.id)}
        error={renameValidationError}
        onChange={setRenameValue}
        onClose={() => {
          if (!busySourceId) setRenameSourceTarget(null);
        }}
        onSubmit={() => void submitRename()}
        value={renameValue}
        visible={Boolean(renameSourceTarget)}
      />
    </TabScreen>
  );
}

function RenameSourceModal({ busy, error, onChange, onClose, onSubmit, value, visible }: {
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  value: string;
  visible: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.renameRoot}>
        <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.sheetBackdrop} />
        <View style={[styles.renameSheet, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
          <Text style={styles.sheetTitle}>{t('sources.renameTitle')}</Text>
          <Text style={styles.sheetSubtitle}>{t('sources.renameBody')}</Text>
          <TextInput
            accessibilityLabel={t('sources.renameTitle')}
            autoFocus
            maxLength={80}
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            returnKeyType="done"
            selectTextOnFocus
            style={[styles.renameInput, error && styles.renameInputError]}
            value={value}
          />
          {error ? <Text accessibilityRole="alert" style={styles.renameError}>{error}</Text> : null}
          <View style={styles.renameActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={({ pressed }) => [styles.renameCancel, pressed && styles.actionPressed]}>
              <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onSubmit} style={({ pressed }) => [styles.renameSubmit, pressed && styles.actionPressed, busy && styles.actionDisabled]}>
              {busy ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.renameSubmitText}>{t('sources.rename')}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  const styles = useThemedStyles(createStyles);
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
                      fallback={soundGlyph(choice).fallback}
                      name={soundGlyph(choice).name}
                      size={16}
                    />
                  </View>
                  <View style={styles.soundCopy}>
                    <Text style={[styles.soundLabel, selected && styles.soundLabelSelected]}>{t(soundLabelKeys[choice])}</Text>
                    {!isIosToneFile(choice) && (
                      <Text style={styles.soundDescription}>{t(soundDescriptionKeys[choice])}</Text>
                    )}
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

const createStyles = () => StyleSheet.create({
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
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', marginBottom: 8, marginHorizontal: 16, minHeight: 48, paddingHorizontal: 13 },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 10, paddingVertical: 8 },
  searchClear: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
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
    height: 44,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 44,
  },
  revokedLabel: { backgroundColor: colors.dangerSoft, borderRadius: radius.full, color: colors.danger, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  pausedLabel: { backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 6 },
  meta: { color: colors.muted, flex: 1, fontSize: 12 },
  lastSeen: { color: colors.mutedLight, fontSize: 12, lineHeight: 17, marginTop: 3 },
  keyRow: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.small, flexDirection: 'row', marginTop: 9, minHeight: 48, paddingHorizontal: 11, paddingVertical: 7 },
  keyCopy: { flex: 1, minWidth: 0 },
  keyLabel: { color: colors.mutedLight, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  keyPrefix: { color: colors.textSoft, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    flexBasis: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  actionPrimary: { minWidth: 92 },
  actionFlex: { minWidth: 132 },
  actionDanger: { minWidth: 108 },
  actionPressed: { opacity: 0.62 },
  actionDisabled: { opacity: 0.42 },
  action: { color: colors.primary, fontSize: 12, fontWeight: '700' },
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
  renameRoot: { flex: 1, justifyContent: 'flex-end' },
  renameSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, paddingHorizontal: 18, paddingTop: 20 },
  renameInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  renameInputError: { borderColor: colors.danger },
  renameError: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 7 },
  renameActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  renameCancel: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.medium, flex: 1, justifyContent: 'center', minHeight: 50 },
  renameSubmit: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flex: 1, justifyContent: 'center', minHeight: 50 },
  renameSubmitText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
