import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useSources } from '@/hooks/useSources';
import { renameSource, revokeSource } from '@/lib/api';
import { relativeTime, sourceInitial } from '@/lib/format';
import { userMessage } from '@/lib/errors';
import { validateSourceInput } from '@/lib/validation';
import { colors, radius, shadows } from '@/theme';
import type { Source } from '@/types';

function recentlyActive(lastSeenAt: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1_000;
}

export default function SourcesScreen() {
  const router = useRouter();
  const { error, load, loading, refresh, refreshing, sources } = useSources(true);
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

  if (loading && sources.length === 0) return <LoadingScreen />;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Your connected sources</Text>
          <Text style={styles.subtitle}>One private token for every computer or app.</Text>
        </View>
        <Pressable
          accessibilityLabel="Add source"
          accessibilityRole="button"
          onPress={() => router.push('/source/new')}
          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
        >
          <AppIcon color={colors.white} fallback="+" name="plus" size={19} />
        </Pressable>
      </View>

      {error && sources.length > 0 ? <ErrorState compact error={error} onRetry={() => void load()} /> : null}

      <FlatList
        accessibilityLabel="Sources"
        contentContainerStyle={sources.length ? styles.list : styles.emptyList}
        data={sources}
        keyExtractor={(item) => item.id}
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
                  {busy ? <ActivityIndicator accessibilityLabel="Updating source" color={colors.primary} size="small" /> : null}
                </View>
                <View style={styles.metaRow}>
                  <AppIcon color={colors.mutedLight} fallback="•" name="desktopcomputer" size={12} />
                  <Text numberOfLines={1} style={styles.meta}>{item.hostname || 'Hostname not provided'}</Text>
                </View>
                <Text style={styles.lastSeen}>
                  {item.last_seen_at ? `Last active ${relativeTime(item.last_seen_at)}` : 'Waiting for its first alert'}
                </Text>
                {!item.revoked_at ? (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityLabel={`Rename ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      onPress={() => askRename(item)}
                      style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                    >
                      <AppIcon color={colors.primary} fallback="✎" name="pencil" size={12} />
                      <Text style={styles.action}>Rename</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Revoke ${item.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(busySourceId) }}
                      disabled={Boolean(busySourceId)}
                      onPress={() => askRevoke(item)}
                      style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', paddingBottom: 17, paddingHorizontal: 18 },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  add: { ...shadows.floating, alignItems: 'center', backgroundColor: colors.primary, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  addPressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.96 }] },
  list: { paddingBottom: 20 },
  emptyList: { flexGrow: 1 },
  card: { ...shadows.card, alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: '#E7ECE9', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 13, marginHorizontal: 16, marginVertical: 6, padding: 15 },
  revoked: { backgroundColor: colors.surfaceMuted },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, height: 48, justifyContent: 'center', position: 'relative', width: 48 },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  onlineDot: { backgroundColor: colors.success, borderColor: colors.surface, borderRadius: radius.full, borderWidth: 3, bottom: -2, height: 14, position: 'absolute', right: -2, width: 14 },
  content: { flex: 1 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  name: { color: colors.text, flexShrink: 1, fontSize: 16, fontWeight: '700' },
  revokedLabel: { backgroundColor: colors.dangerSoft, borderRadius: radius.full, color: colors.danger, fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 3 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 5 },
  meta: { color: colors.muted, flex: 1, fontSize: 11 },
  lastSeen: { color: colors.mutedLight, fontSize: 10, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 7 },
  actionButton: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.full, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  actionPressed: { opacity: 0.62 },
  action: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  danger: { color: colors.danger },
});
