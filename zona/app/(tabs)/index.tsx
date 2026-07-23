import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { NotificationCard } from '@/components/NotificationCard';
import { useInbox } from '@/hooks/useInbox';
import { useSources } from '@/hooks/useSources';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius } from '@/theme';

const oneDayInMilliseconds = 24 * 60 * 60 * 1_000;

export default function InboxScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [last24Hours, setLast24Hours] = useState(false);

  const since = useMemo(
    () => last24Hours ? new Date(Date.now() - oneDayInMilliseconds).toISOString() : null,
    [last24Hours],
  );
  const filters = useMemo(() => ({
    since,
    sourceId: selectedSource,
    unreadOnly,
  }), [selectedSource, since, unreadOnly]);

  const inbox = useInbox(session?.user.id ?? '', filters);
  const sourceState = useSources(true);
  const sourceOptions = useMemo(
    () => [...sourceState.sources].sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [sourceState.sources],
  );
  const filtersActive = Boolean(selectedSource || unreadOnly || last24Hours);
  const emptyMessage = filtersActive
    ? 'No notifications match these filters. Clear a filter or check again later.'
    : 'Create a source, then send your first notification from a local app.';

  function clearFilters() {
    setSelectedSource(null);
    setUnreadOnly(false);
    setLast24Hours(false);
  }

  if (inbox.loading && inbox.items.length === 0) return <LoadingScreen />;
  if (inbox.error && inbox.items.length === 0) {
    return (
      <View style={styles.page}>
        <ErrorState error={inbox.error} onRetry={() => void inbox.retry()} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.summary}>
        <View style={[styles.summaryIcon, inbox.unreadCount === 0 && styles.summaryIconQuiet]}>
          <AppIcon
            color={inbox.unreadCount ? colors.accent : colors.primary}
            fallback={inbox.unreadCount ? '!' : '✓'}
            name={inbox.unreadCount ? 'bell.badge.fill' : 'checkmark'}
            size={24}
          />
        </View>
        <View style={styles.summaryCopy}>
          <Text accessibilityLiveRegion="polite" style={styles.summaryTitle}>
            {inbox.unreadCount
              ? `${inbox.unreadCount} ${inbox.unreadCount === 1 ? 'alert' : 'alerts'} waiting`
              : 'Everything is quiet'}
          </Text>
          <Text style={styles.summaryCaption}>
            {inbox.unreadCount ? 'Unread activity across all sources' : 'No unread notifications right now'}
          </Text>
        </View>
        <Text style={styles.retention}>7 days</Text>
      </View>

      <View style={styles.filterLabelRow}>
        <Text style={styles.filterLabel}>FILTERS</Text>
        {filtersActive ? (
          <Pressable
            accessibilityLabel="Clear all inbox filters"
            accessibilityRole="button"
            hitSlop={4}
            onPress={clearFilters}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          >
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        accessibilityLabel="Inbox filters"
        contentContainerStyle={styles.filters}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <FilterChip active={!selectedSource} label="All sources" onPress={() => setSelectedSource(null)} />
        <FilterChip active={unreadOnly} label="Unread only" onPress={() => setUnreadOnly((value) => !value)} />
        <FilterChip active={last24Hours} label="Last 24 hours" onPress={() => setLast24Hours((value) => !value)} />
        {sourceState.loading && sourceOptions.length === 0 ? (
          <View accessibilityLabel="Loading source filters" accessible style={styles.filterLoading}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
        {sourceOptions.map((source) => (
          <FilterChip
            active={selectedSource === source.id}
            key={source.id}
            label={source.revoked_at ? `${source.display_name} · Revoked` : source.display_name}
            onPress={() => setSelectedSource(source.id)}
          />
        ))}
      </ScrollView>

      {sourceState.error ? <ErrorState compact error={sourceState.error} onRetry={() => void sourceState.load()} /> : null}
      {inbox.error ? <ErrorState compact error={inbox.error} onRetry={() => void inbox.retry()} /> : null}

      <FlatList
        accessibilityLabel="Notifications"
        contentContainerStyle={inbox.items.length ? styles.list : styles.emptyList}
        data={inbox.items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState title="No alerts here" message={emptyMessage} />}
        ListFooterComponent={inbox.hasMore ? (
          <View style={styles.pagination}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: inbox.loadingMore }}
              disabled={inbox.loadingMore}
              onPress={() => void inbox.loadMore()}
              style={({ pressed }) => [styles.loadMore, pressed && styles.pressed, inbox.loadingMore && styles.disabled]}
            >
              {inbox.loadingMore
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={styles.loadMoreText}>Load more</Text>}
            </Pressable>
          </View>
        ) : null}
        refreshControl={(
          <RefreshControl
            onRefresh={() => void inbox.refresh()}
            refreshing={inbox.refreshing}
            tintColor={colors.primary}
          />
        )}
        renderItem={({ item }) => (
          <NotificationCard
            item={item}
            onPress={() => router.push({ pathname: '/notification/[id]', params: { id: item.id } })}
          />
        )}
      />
    </View>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  summary: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, flexDirection: 'row', marginBottom: 10, marginHorizontal: 16, padding: 15 },
  summaryIcon: { alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: 14, height: 46, justifyContent: 'center', marginRight: 12, width: 46 },
  summaryIconQuiet: { backgroundColor: colors.primarySoft },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  summaryCaption: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  retention: { backgroundColor: colors.surfaceMuted, borderRadius: radius.full, color: colors.muted, fontSize: 10, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
  filterLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 18 },
  filterLabel: { color: colors.mutedLight, fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  clear: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  filters: { alignItems: 'center', gap: 8, paddingBottom: 10, paddingHorizontal: 16 },
  filterLoading: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  chip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full, borderWidth: 1, justifyContent: 'center', maxWidth: 180, minHeight: 44, paddingHorizontal: 14 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  list: { paddingBottom: 20 },
  emptyList: { flexGrow: 1 },
  pagination: { alignItems: 'center', padding: 14 },
  loadMore: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, justifyContent: 'center', minHeight: 44, minWidth: 132, paddingHorizontal: 18 },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
});
