import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';

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
import { validateSourceInput } from '@/lib/validation';
import { colors, radius, shadows } from '@/theme';
import type { ApiKey, Source } from '@/types';

type SoundName = ApiKey['sound_name'];

const soundLabels: Record<SoundName, string> = {
  default: 'Default',
  silent: 'Silent',
  'zona-soft.wav': 'Soft',
  'zona-bright.wav': 'Bright',
  'zona-urgent.wav': 'Urgent',
  'zona-chime.wav': 'Chime',
  'zona-crystal.wav': 'Crystal',
  'zona-warm.wav': 'Warm',
  'zona-pulse.wav': 'Pulse',
  'zona-signal.wav': 'Signal',
  'zona-bloom.wav': 'Bloom',
};

/** Ordered list for the sound picker (Silent last among real options). */
const soundChoices: { label: string; value: SoundName }[] = [
  { label: 'Default', value: 'default' },
  { label: 'Soft', value: 'zona-soft.wav' },
  { label: 'Bright', value: 'zona-bright.wav' },
  { label: 'Urgent', value: 'zona-urgent.wav' },
  { label: 'Chime', value: 'zona-chime.wav' },
  { label: 'Crystal', value: 'zona-crystal.wav' },
  { label: 'Warm', value: 'zona-warm.wav' },
  { label: 'Pulse', value: 'zona-pulse.wav' },
  { label: 'Signal', value: 'zona-signal.wav' },
  { label: 'Bloom', value: 'zona-bloom.wav' },
  { label: 'Silent', value: 'silent' },
];

function recentlyActive(lastSeenAt: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1_000;
}

export default function SourcesScreen() {
  const router = useRouter();
  const { error, load, loading, patchSource, refresh, refreshing, sources } = useSources(true);
  const bottomPad = useTabBarContentPadding();
  const [busySourceId, setBusySourceId] = useState<string | null>(null);

  function askRename(source: Source) {
    if (busySourceId) return;
    Alert.prompt(
      'Rename source',
      'Historical notifications keep the name they had when sent.',
      async (name) => {
        const normalized = name.trim();
        if (!normalized || normalized === source.display_name) return;
        const validationError = validateSourceInput(normalized, source.hostname ?? '');
        if (validationError) {
          Alert.alert('Check the source name', validationError);
          return;
        }

        setBusySourceId(source.id);
        try {
          await renameSource(source.id, normalized);
          await load();
        } catch (caught) {
          Alert.alert('Could not rename', userMessage(caught));
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
      'Revoke this source?',
      `${source.display_name} will immediately lose access. Existing notifications remain until they expire.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setBusySourceId(source.id);
            try {
              await revokeSource(source.id);
              await load();
            } catch (caught) {
              Alert.alert('Could not revoke', userMessage(caught));
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
      Alert.alert('Could not update API key', userMessage(caught));
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
      Alert.alert('Could not update sound', userMessage(caught));
    } finally {
      setBusySourceId(null);
    }
  }

  function askSound(source: Source) {
    if (busySourceId || !source.api_key) return;
    const title = `Sound for ${source.display_name}`;
    const message = 'Bundled sounds require an installed Zona build (not Expo Go).';

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [...soundChoices.map((choice) => choice.label), 'Cancel'],
          cancelButtonIndex: soundChoices.length,
          userInterfaceStyle: 'light',
        },
        (index) => {
          if (index === undefined || index >= soundChoices.length) return;
          void updateSound(source, soundChoices[index].value);
        },
      );
      return;
    }

    Alert.alert(
      title,
      message,
      [
        ...soundChoices.map((choice) => ({
          text: choice.label,
          onPress: () => void updateSound(source, choice.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }

  async function sendTest(source: Source) {
    if (busySourceId || !source.api_key?.is_active || source.revoked_at) return;
    setBusySourceId(source.id);
    try {
      const result = await testSource(source.id);
      const message = result.pushAccepted > 0
        ? 'The alert was saved and accepted by Expo Push Service.'
        : result.pushAttempted > 0
        ? 'The alert was saved, but Zona did not accept the push. Check notification permissions in Settings.'
        : 'The alert was saved to your inbox. Open Settings and enable push notifications on this iPhone.';
      Alert.alert('Test alert sent', message);
      await load();
    } catch (caught) {
      Alert.alert('Test alert failed', userMessage(caught));
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
          <Text style={styles.title}>Auth keys & sources</Text>
          <Text style={styles.subtitle}>One independently controlled key for every computer or app.</Text>
        </View>
        <Pressable
          accessibilityLabel="Add a new source and API key"
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
        accessibilityLabel="Sources"
        contentContainerStyle={[
          sources.length ? styles.list : styles.emptyList,
          { paddingBottom: bottomPad },
        ]}
        data={sources}
        keyExtractor={(item) => item.id}
        style={styles.listSurface}
        ListEmptyComponent={error
          ? <ErrorState error={error} onRetry={() => void load()} />
          : <EmptyState title="No sources yet" message="Add a source to get a private API token for one PC or application." />}
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
                {online ? <View accessibilityLabel="Recently active" accessible style={styles.onlineDot} /> : null}
              </View>
              <View style={styles.content}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{item.display_name}</Text>
                  {item.revoked_at ? <Text style={styles.revokedLabel}>REVOKED</Text> : null}
                  {!item.revoked_at && !keyActive ? <Text style={styles.pausedLabel}>PAUSED</Text> : null}
                  {busy ? <ActivityIndicator accessibilityLabel="Updating source" color={colors.primary} size="small" /> : null}
                  {!item.revoked_at ? (
                    <Pressable
                      accessibilityLabel={`Rename ${item.display_name}`}
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
                  <Text numberOfLines={1} style={styles.meta}>{item.hostname || 'Hostname not provided'}</Text>
                </View>
                <Text style={styles.lastSeen}>
                  {item.last_seen_at ? `Last active ${relativeTime(item.last_seen_at)}` : 'Waiting for its first alert'}
                </Text>
                <View style={styles.keyRow}>
                  <View style={styles.keyCopy}>
                    <Text style={styles.keyLabel}>API KEY</Text>
                    <Text style={styles.keyPrefix}>{item.api_key?.key_prefix ? `${item.api_key.key_prefix}…` : 'Existing protected key'}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={`${keyActive ? 'Pause' : 'Activate'} ${item.display_name} API key`}
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
                      accessibilityLabel={`Send a test alert from ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) || !keyActive }}
                      disabled={Boolean(busySourceId) || !keyActive}
                      onPress={() => void sendTest(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionPrimary, pressed && styles.actionPressed, !keyActive && styles.actionDisabled]}
                    >
                      <AppIcon color={colors.accent} fallback="!" name="bell.badge.fill" size={12} />
                      <Text style={[styles.action, styles.testAction]}>Test</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Change notification sound for ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      onPress={() => askSound(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionFlex, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.primary} fallback="♪" name="speaker.wave.2.fill" size={12} />
                      <Text numberOfLines={1} style={styles.action}>{soundLabels[item.api_key?.sound_name ?? 'default']}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Revoke ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      onPress={() => askRevoke(item)}
                      style={({ pressed }) => [styles.actionButton, styles.actionDanger, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.danger} fallback="×" name="xmark.circle" size={12} />
                      <Text style={[styles.action, styles.danger]}>Revoke</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </TabScreen>
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
});
