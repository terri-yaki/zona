import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { NotificationCard } from '@/components/NotificationCard';
import { TabScreen, useTabBarContentPadding } from '@/components/TabScreen';
import { useInbox } from '@/hooks/useInbox';
import { useSources } from '@/hooks/useSources';
import { userMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { getLocaleTag } from '@/i18n';
import { colors, radius } from '@/theme';

const oneDayInMilliseconds = 24 * 60 * 60 * 1_000;

export default function InboxScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { language, t, tc } = useI18n();
  const bottomPad = useTabBarContentPadding();
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
    () => [...sourceState.sources].sort((left, right) => left.display_name.localeCompare(right.display_name, getLocaleTag(language))),
    [language, sourceState.sources],
  );
  const filtersActive = Boolean(selectedSource || unreadOnly || last24Hours);
  const emptyMessage = filtersActive
    ? t('inbox.filteredEmpty')
    : t('inbox.firstEmpty');

  function clearFilters() {
    setSelectedSource(null);
    setUnreadOnly(false);
    setLast24Hours(false);
  }

  async function onMarkAllRead() {
    try {
      await inbox.markAllRead();
    } catch (caught) {
      Alert.alert(t('inbox.markReadError'), userMessage(caught));
    }
  }

  // Full-screen only on first open of the inbox — never when switching filter chips.
  if (inbox.bootstrapping && inbox.items.length === 0 && !inbox.error) {
    return (
      <TabScreen>
        <LoadingScreen />
      </TabScreen>
    );
  }
  if (inbox.error && inbox.items.length === 0 && !inbox.filterLoading) {
    return (
      <TabScreen>
        <ErrorState error={inbox.error} onRetry={() => void inbox.retry()} />
      </TabScreen>
    );
  }

  return (
    <TabScreen>
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
              ? tc('inbox.alertsWaiting.one', 'inbox.alertsWaiting.other', inbox.unreadCount)
              : t('inbox.quiet')}
          </Text>
          <Text style={styles.summaryCaption}>
            {inbox.unreadCount ? t('inbox.unreadActivity') : t('inbox.noUnread')}
          </Text>
        </View>
        {inbox.unreadCount > 0 ? (
          <Pressable
            accessibilityLabel={t('inbox.markAllA11y')}
            accessibilityRole="button"
            accessibilityState={{ disabled: inbox.markingAllRead }}
            disabled={inbox.markingAllRead}
            onPress={() => void onMarkAllRead()}
            style={({ pressed }) => [styles.readAllButton, pressed && styles.pressed, inbox.markingAllRead && styles.disabled]}
          >
            {inbox.markingAllRead
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.readAllText}>{t('inbox.readAll')}</Text>}
          </Pressable>
        ) : (
          <Text style={styles.retention}>{t('common.sevenDays')}</Text>
        )}
      </View>

      <View style={styles.filterLabelRow}>
        <Text style={styles.filterLabel}>{t('inbox.filters')}</Text>
        {filtersActive ? (
          <Pressable
            accessibilityLabel={t('inbox.clearFiltersA11y')}
            accessibilityRole="button"
            hitSlop={4}
            onPress={clearFilters}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          >
            <Text style={styles.clear}>{t('inbox.clear')}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        accessibilityLabel={t('inbox.filtersA11y')}
        contentContainerStyle={styles.filters}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
      >
        <FilterChip active={!selectedSource} label={t('inbox.allSources')} onPress={() => setSelectedSource(null)} tone="default" />
        <FilterChip active={unreadOnly} label={t('inbox.unreadOnly')} onPress={() => setUnreadOnly((value) => !value)} tone="default" />
        <FilterChip active={last24Hours} label={t('inbox.last24Hours')} onPress={() => setLast24Hours((value) => !value)} tone="default" />
        {sourceState.loading && sourceOptions.length === 0 ? (
          <View accessibilityLabel={t('inbox.loadingFilters')} accessible style={styles.filterLoading}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
        {sourceOptions.map((source) => (
          <FilterChip
            active={selectedSource === source.id}
            key={source.id}
            label={source.revoked_at ? `${source.display_name} · ${t('inbox.revokedSuffix')}` : source.display_name}
            muted={Boolean(source.revoked_at)}
            onPress={() => setSelectedSource(source.id)}
            tone="source"
          />
        ))}
      </ScrollView>

      {sourceState.error ? <ErrorState compact error={sourceState.error} onRetry={() => void sourceState.load()} /> : null}
      {inbox.error ? <ErrorState compact error={inbox.error} onRetry={() => void inbox.retry()} /> : null}

      <FlatList
        accessibilityLabel={t('inbox.notificationsA11y')}
        contentContainerStyle={[
          inbox.items.length ? styles.list : styles.emptyList,
          { paddingBottom: bottomPad },
        ]}
        data={inbox.items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          inbox.filterLoading ? (
            <View accessibilityLabel={t('inbox.loadingFiltered')} style={styles.filterListLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : (
            <EmptyState title={t('inbox.emptyTitle')} message={emptyMessage} />
          )
        }
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
                : <Text style={styles.loadMoreText}>{t('inbox.loadMore')}</Text>}
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
        style={styles.listSurface}
      />
    </TabScreen>
  );
}

function FilterChip({
  active,
  label,
  muted = false,
  onPress,
  tone,
}: {
  active: boolean;
  label: string;
  muted?: boolean;
  onPress: () => void;
  tone: 'default' | 'source';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        tone === 'source' && styles.chipSource,
        active && (tone === 'source' ? styles.chipSourceActive : styles.chipActive),
        muted && styles.chipMuted,
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.chipText,
          tone === 'source' && styles.chipSourceText,
          active && styles.chipTextActive,
          muted && styles.chipTextMuted,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 15,
  },
  listSurface: { backgroundColor: colors.background, flex: 1 },
  summaryIcon: { alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: 14, height: 46, justifyContent: 'center', marginRight: 12, width: 46 },
  summaryIconQuiet: { backgroundColor: colors.primarySoft },
  summaryCopy: { flex: 1, marginRight: 8 },
  summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  summaryCaption: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  retention: { backgroundColor: colors.surfaceMuted, borderRadius: radius.full, color: colors.muted, fontSize: 10, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
  readAllButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 84,
    paddingHorizontal: 12,
  },
  readAllText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  filterLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, paddingBottom: 2, paddingHorizontal: 18 },
  filterLabel: { color: colors.mutedLight, fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: 36, minWidth: 44 },
  clear: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  filtersScroll: { flexGrow: 0, marginBottom: 4, overflow: 'visible' },
  filters: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterLoading: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  filterListLoading: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', minHeight: 160, paddingVertical: 40 },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: 180,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSource: {
    backgroundColor: colors.accentSoft,
    borderColor: '#E8D0C0',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipSourceActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipMuted: { opacity: 0.52 },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  chipSourceText: { color: colors.accent },
  chipTextActive: { color: colors.white },
  chipTextMuted: { fontWeight: '500' },
  list: { flexGrow: 1 },
  emptyList: { flexGrow: 1 },
  pagination: { alignItems: 'center', padding: 14 },
  loadMore: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, justifyContent: 'center', minHeight: 44, minWidth: 132, paddingHorizontal: 18 },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
});
