import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { InboxSkeleton } from '@/components/InboxSkeleton';
import { NotificationCard } from '@/components/NotificationCard';
import { TabScreen, useTabBarContentPadding } from '@/components/TabScreen';
import { useInbox } from '@/hooks/useInbox';
import { useSources } from '@/hooks/useSources';
import { deleteSavedInboxFilter, listSavedInboxFilters, saveInboxFilter, type NotificationSeverityFilter, type SavedInboxFilter } from '@/data/inbox-filters';
import { userMessage } from '@/lib/errors';
import { groupRepeatedNotifications } from '@/lib/notification-grouping';
import { sortSourcesForFilters } from '@/lib/source-filters';
import { runtimeNumber } from '@/lib/runtime-controls';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { getLocaleTag } from '@/i18n';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export default function InboxScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session } = useAuth();
  const { language, t, tc } = useI18n();
  const { snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const bottomPad = useTabBarContentPadding();
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [severity, setSeverity] = useState<NotificationSeverityFilter>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [savedFilters, setSavedFilters] = useState<SavedInboxFilter[]>([]);
  const [savedFiltersLoading, setSavedFiltersLoading] = useState(true);
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [savingFilter, setSavingFilter] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  // Stores the cutoff timestamp when the chip is toggled on; null when off.
  const [since, setSince] = useState<string | null>(null);
  const filtersVisible = isVisible('inbox.filters');
  const filtersEnabled = isEnabled('inbox.filters');
  const sourceFilterVisible = filtersVisible && isVisible('inbox.source_filter');
  const unreadFilterVisible = filtersVisible && isVisible('inbox.unread_filter');
  const timeFilterVisible = filtersVisible && isVisible('inbox.time_filter');
  const searchVisible = isVisible('inbox.search');
  const savedFilterVisible = filtersVisible && isVisible('inbox.saved_filters');
  const pinnedFilterVisible = filtersVisible && isVisible('inbox.pinned_filter');
  const severityFilterVisible = filtersVisible && isVisible('inbox.severity_filter');
  const effectiveSource = sourceFilterVisible ? selectedSource : null;
  const effectiveUnreadOnly = unreadFilterVisible && unreadOnly;
  const effectiveSince = timeFilterVisible ? since : null;
  const last24Hours = effectiveSince !== null;
  const filters = useMemo(() => ({
    pinnedOnly: pinnedFilterVisible && pinnedOnly,
    searchQuery: searchVisible ? debouncedSearch : '',
    severity: severityFilterVisible ? severity : null,
    since: effectiveSince,
    sourceId: effectiveSource,
    unreadOnly: effectiveUnreadOnly,
  }), [debouncedSearch, effectiveSource, effectiveSince, effectiveUnreadOnly, pinnedFilterVisible, pinnedOnly, searchVisible, severity, severityFilterVisible]);

  const pageSize = runtimeNumber(snapshot, 'inbox.page_size', 30, 10, 100);
  const widgetEnabled = isVisible('ios.widget') && isEnabled('ios.widget');
  const inbox = useInbox(session?.user.id ?? '', filters, pageSize, widgetEnabled);
  const sourceState = useSources(true);
  const timeFilterMilliseconds = runtimeNumber(snapshot, 'inbox.time_filter_hours', 24, 1, 720) * 60 * 60 * 1_000;
  const maxSourceFilters = runtimeNumber(snapshot, 'inbox.max_source_filters', 50, 1, 200);
  const sourceOptions = useMemo(
    () => sortSourcesForFilters(
      sourceState.sources.filter((source) => !source.revoked_at || (
        isVisible('inbox.show_revoked_filters') && isEnabled('inbox.show_revoked_filters')
      )),
      getLocaleTag(language),
    ).slice(0, maxSourceFilters),
    [isEnabled, isVisible, language, maxSourceFilters, sourceState.sources],
  );
  const filtersActive = Boolean(effectiveSource || effectiveUnreadOnly || last24Hours || filters.pinnedOnly || filters.severity || filters.searchQuery);
  const groups = useMemo(() => (
    isVisible('inbox.grouping') && isEnabled('inbox.grouping')
      ? groupRepeatedNotifications(inbox.items)
      : inbox.items.map((item) => ({ id: item.id, items: [item], latest: item }))
  ), [inbox.items, isEnabled, isVisible]);
  const emptyMessage = filtersActive
    ? t('inbox.filteredEmpty')
    : t('inbox.firstEmpty');

  function clearFilters() {
    setSelectedSource(null);
    setUnreadOnly(false);
    setSince(null);
    setPinnedOnly(false);
    setSeverity(null);
    setSearchQuery('');
    setDebouncedSearch('');
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!session?.user.id || !savedFilterVisible || !isEnabled('inbox.saved_filters')) return;
    let active = true;
    void listSavedInboxFilters()
      .then((items) => { if (active) setSavedFilters(items); })
      .catch(() => undefined)
      .finally(() => { if (active) setSavedFiltersLoading(false); });
    return () => { active = false; };
  }, [isEnabled, savedFilterVisible, session?.user.id]);

  function applySavedFilter(saved: SavedInboxFilter, now: number) {
    setSelectedSource(saved.sourceId);
    setUnreadOnly(saved.unreadOnly);
    setPinnedOnly(saved.pinnedOnly);
    setSeverity(saved.severity);
    setSearchQuery(saved.searchQuery);
    setDebouncedSearch(saved.searchQuery);
    setSince(saved.sinceHours ? new Date(now - saved.sinceHours * 60 * 60 * 1_000).toISOString() : null);
  }

  async function createSavedFilter() {
    const name = saveFilterName.trim();
    if (!name || savingFilter) return;
    setSavingFilter(true);
    try {
      const saved = await saveInboxFilter({
        name,
        pinnedOnly: filters.pinnedOnly,
        searchQuery: filters.searchQuery,
        severity: filters.severity,
        sinceHours: last24Hours ? timeFilterMilliseconds / (60 * 60 * 1_000) : null,
        sourceId: filters.sourceId,
        unreadOnly: filters.unreadOnly,
      });
      setSavedFilters((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setSaveFilterName('');
      setSaveFilterOpen(false);
    } catch (caught) {
      Alert.alert(t('inbox.savedFilterError'), userMessage(caught));
    } finally {
      setSavingFilter(false);
    }
  }

  function removeSavedFilter(saved: SavedInboxFilter) {
    Alert.alert(t('inbox.deleteSavedFilterTitle'), t('inbox.deleteSavedFilterBody', { name: saved.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => {
        void deleteSavedInboxFilter(saved.id).then(() => {
          setSavedFilters((current) => current.filter((item) => item.id !== saved.id));
        }).catch((caught) => Alert.alert(t('inbox.savedFilterError'), userMessage(caught)));
      } },
    ]);
  }

  async function onMarkAllRead() {
    try {
      await inbox.markAllRead();
    } catch (caught) {
      Alert.alert(t('inbox.markReadError'), userMessage(caught));
    }
  }

  // Full-screen only on first open of the inbox — never when switching filter chips.
  // Include chrome placeholders so the first paint matches real summary/search/filters.
  if (inbox.bootstrapping && inbox.items.length === 0 && !inbox.error) {
    return (
      <TabScreen>
        {/* The skeleton hides itself from assistive technology, so the wrapper
            carries the loading announcement like the filter-loading branch. */}
        <View accessibilityLabel={t('inbox.loadingFiltered')} style={styles.bootstrapLoading}>
          <InboxSkeleton showChrome />
        </View>
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

  // Chrome (summary, search, filters) lives in ListHeaderComponent so it scrolls
  // away with the list instead of staying pinned above the FlatList.
  const listHeader = (
    <View>
      {isVisible('inbox.summary') ? <View style={styles.summary}>
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
        {inbox.unreadCount > 0 && isVisible('inbox.mark_all_read') ? (
          <Pressable
            accessibilityLabel={t('inbox.markAllA11y')}
            accessibilityRole="button"
            accessibilityState={{ disabled: inbox.markingAllRead || !isEnabled('inbox.mark_all_read') }}
            disabled={inbox.markingAllRead || !isEnabled('inbox.mark_all_read')}
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
      </View> : null}

      {searchVisible ? <View style={[styles.searchBox, !isEnabled('inbox.search') && styles.disabled]}>
        <AppIcon color={colors.mutedLight} fallback="?" name="magnifyingglass" size={16} />
        <TextInput
          accessibilityLabel={t('inbox.searchA11y')}
          autoCapitalize="none"
          editable={isEnabled('inbox.search')}
          maxLength={100}
          onChangeText={setSearchQuery}
          placeholder={t('inbox.searchPlaceholder')}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        {searchQuery ? <Pressable accessibilityLabel={t('inbox.clearSearch')} accessibilityRole="button" hitSlop={6} onPress={() => { setSearchQuery(''); setDebouncedSearch(''); }} style={styles.searchClear}>
          <AppIcon color={colors.mutedLight} fallback="×" name="xmark.circle.fill" size={17} />
        </Pressable> : null}
      </View> : null}

      {filtersVisible && (sourceFilterVisible || unreadFilterVisible || timeFilterVisible || pinnedFilterVisible || severityFilterVisible) ? <><View style={styles.filterLabelRow}>
        <Text style={styles.filterLabel}>{t('inbox.filters')}</Text>
        <View style={styles.filterHeaderActions}>
          {/* Always mount action slots so showing/hiding them never shifts the chip row. */}
          {savedFilterVisible ? (
            <Pressable
              accessibilityElementsHidden={!filtersActive}
              accessibilityRole="button"
              disabled={!filtersActive || !isEnabled('inbox.saved_filters')}
              importantForAccessibility={filtersActive ? 'auto' : 'no-hide-descendants'}
              onPress={() => setSaveFilterOpen(true)}
              pointerEvents={filtersActive ? 'auto' : 'none'}
              style={[styles.clearButton, !filtersActive && styles.filterActionHidden]}
            >
              <Text style={styles.saveFilter}>{t('inbox.saveFilter')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityElementsHidden={!filtersActive}
            accessibilityLabel={t('inbox.clearFiltersA11y')}
            accessibilityRole="button"
            disabled={!filtersActive}
            hitSlop={4}
            importantForAccessibility={filtersActive ? 'auto' : 'no-hide-descendants'}
            onPress={clearFilters}
            pointerEvents={filtersActive ? 'auto' : 'none'}
            style={({ pressed }) => [
              styles.clearButton,
              !filtersActive && styles.filterActionHidden,
              filtersActive && pressed && styles.pressed,
            ]}
          >
            <Text style={styles.clear}>{t('inbox.clear')}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        accessibilityLabel={t('inbox.filtersA11y')}
        contentContainerStyle={styles.filters}
        horizontal
        nestedScrollEnabled
        pointerEvents={filtersEnabled ? 'auto' : 'none'}
        showsHorizontalScrollIndicator={false}
        style={[styles.filtersScroll, !filtersEnabled && styles.disabled]}
      >
        {sourceFilterVisible ? <FilterChip active={!selectedSource} disabled={!filtersEnabled || !isEnabled('inbox.source_filter')} label={t('inbox.allSources')} onPress={() => setSelectedSource(null)} tone="default" /> : null}
        {unreadFilterVisible ? <FilterChip active={unreadOnly} disabled={!filtersEnabled || !isEnabled('inbox.unread_filter')} label={t('inbox.unreadOnly')} onPress={() => setUnreadOnly((value) => !value)} tone="default" /> : null}
        {pinnedFilterVisible ? <FilterChip active={pinnedOnly} disabled={!filtersEnabled || !isEnabled('inbox.pinned_filter')} label={t('inbox.pinnedOnly')} onPress={() => setPinnedOnly((value) => !value)} tone="default" /> : null}
        {timeFilterVisible ? <FilterChip active={last24Hours} disabled={!filtersEnabled || !isEnabled('inbox.time_filter')} label={t('inbox.last24Hours')} onPress={() => setSince((value) => value ? null : new Date(Date.now() - timeFilterMilliseconds).toISOString())} tone="default" /> : null}
        {severityFilterVisible ? (['critical', 'high', 'medium', 'low'] as const).map((level) => <FilterChip active={severity === level} disabled={!filtersEnabled || !isEnabled('inbox.severity_filter')} key={level} label={t(`severity.${level}`)} onPress={() => setSeverity((current) => current === level ? null : level)} tone="default" />) : null}
        {sourceFilterVisible && sourceState.loading && sourceOptions.length === 0 ? (
          <View accessibilityLabel={t('inbox.loadingFilters')} accessible style={styles.filterLoading}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
        {sourceFilterVisible ? sourceOptions.map((source) => (
          <FilterChip
            active={selectedSource === source.id}
            disabled={!filtersEnabled || !isEnabled('inbox.source_filter')}
            key={source.id}
            label={source.revoked_at ? `${source.display_name} · ${t('inbox.revokedSuffix')}` : source.display_name}
            muted={Boolean(source.revoked_at)}
            onPress={() => setSelectedSource(source.id)}
            tone="source"
          />
        )) : null}
      </ScrollView></> : null}

      {savedFilterVisible && (savedFiltersLoading || savedFilters.length) ? <ScrollView contentContainerStyle={styles.savedFilters} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.savedFiltersScroll}>
        <Text style={styles.savedLabel}>{t('inbox.saved')}</Text>
        {savedFiltersLoading ? <ActivityIndicator color={colors.primary} size="small" /> : savedFilters.map((saved) => <Pressable accessibilityHint={t('inbox.savedFilterDeleteHint')} accessibilityRole="button" key={saved.id} onLongPress={() => removeSavedFilter(saved)} onPress={() => applySavedFilter(saved, Date.now())} style={({ pressed }) => [styles.savedChip, pressed && styles.pressed]}>
          <AppIcon color={colors.primary} fallback="S" name="bookmark.fill" size={12} />
          <Text numberOfLines={1} style={styles.savedChipText}>{saved.name}</Text>
        </Pressable>)}
      </ScrollView> : null}

      {sourceState.error ? <ErrorState compact error={sourceState.error} onRetry={() => void sourceState.load()} /> : null}
      {inbox.error ? <ErrorState compact error={inbox.error} onRetry={() => void inbox.retry()} /> : null}
    </View>
  );

  return (
    <TabScreen>
      <FlatList
        accessibilityLabel={t('inbox.notificationsA11y')}
        contentContainerStyle={[
          inbox.items.length ? styles.list : styles.emptyList,
          { paddingBottom: bottomPad },
        ]}
        data={groups}
        keyExtractor={(group) => group.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          inbox.filterLoading ? (
            // Chrome already scrolls in ListHeaderComponent — only card rows here.
            <View accessibilityLabel={t('inbox.loadingFiltered')} style={styles.filterListLoading}>
              <InboxSkeleton showChrome={false} />
            </View>
          ) : (
            <EmptyState title={t('inbox.emptyTitle')} message={emptyMessage} />
          )
        }
        ListFooterComponent={inbox.hasMore && isVisible('inbox.pagination') ? (
          <View style={styles.pagination}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: inbox.loadingMore || !isEnabled('inbox.pagination') }}
              disabled={inbox.loadingMore || !isEnabled('inbox.pagination')}
              onPress={() => void inbox.loadMore()}
              style={({ pressed }) => [styles.loadMore, pressed && styles.pressed, inbox.loadingMore && styles.disabled]}
            >
              {inbox.loadingMore
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={styles.loadMoreText}>{t('inbox.loadMore')}</Text>}
            </Pressable>
          </View>
        ) : null}
        ListHeaderComponent={listHeader}
        refreshControl={isVisible('inbox.pull_to_refresh') && isEnabled('inbox.pull_to_refresh') ? (
          <RefreshControl
            onRefresh={() => void inbox.refresh()}
            refreshing={inbox.refreshing}
            tintColor={colors.primary}
          />
        ) : undefined}
        renderItem={({ item: group }) => <View>
          <NotificationCard
            item={group.latest}
            onPress={() => {
              if (group.items.length === 1) router.push({ pathname: '/notification/[id]', params: { id: group.latest.id } });
              else setExpandedGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                return next;
              });
            }}
            repeatCount={group.items.length}
          />
          {expandedGroups.has(group.id) ? <View style={styles.groupChildren}>{group.items.slice(1).map((child) => <NotificationCard item={child} key={child.id} onPress={() => router.push({ pathname: '/notification/[id]', params: { id: child.id } })} />)}</View> : null}
        </View>}
        style={styles.listSurface}
      />
      <Modal animationType="fade" onRequestClose={() => setSaveFilterOpen(false)} transparent visible={saveFilterOpen}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={() => setSaveFilterOpen(false)} style={styles.modalBackdrop} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('inbox.saveFilterTitle')}</Text>
            <Text style={styles.modalBody}>{t('inbox.saveFilterBody')}</Text>
            <TextInput accessibilityLabel={t('inbox.filterName')} autoFocus maxLength={40} onChangeText={setSaveFilterName} onSubmitEditing={() => void createSavedFilter()} placeholder={t('inbox.filterNamePlaceholder')} placeholderTextColor={colors.muted} returnKeyType="done" style={styles.modalInput} value={saveFilterName} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={savingFilter} onPress={() => setSaveFilterOpen(false)} style={styles.modalSecondary}><Text style={styles.modalSecondaryText}>{t('common.cancel')}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={savingFilter || !saveFilterName.trim()} onPress={() => void createSavedFilter()} style={[styles.modalPrimary, (savingFilter || !saveFilterName.trim()) && styles.disabled]}>{savingFilter ? <ActivityIndicator color={colors.white} /> : <Text style={styles.modalPrimaryText}>{t('inbox.saveFilter')}</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </TabScreen>
  );
}

function FilterChip({
  active,
  disabled = false,
  label,
  muted = false,
  onPress,
  tone,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  muted?: boolean;
  onPress: () => void;
  tone: 'default' | 'source';
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        tone === 'source' && styles.chipSource,
        active && (tone === 'source' ? styles.chipSourceActive : styles.chipActive),
        muted && styles.chipMuted,
        disabled && styles.disabled,
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

const createStyles = () => StyleSheet.create({
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
  retention: { backgroundColor: colors.surfaceMuted, borderRadius: radius.full, color: colors.muted, fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
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
  filterLabelRow: { alignItems: 'center', flexDirection: 'row', height: 36, justifyContent: 'space-between', paddingBottom: 2, paddingHorizontal: 18 },
  filterHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 4, height: 36 },
  filterLabel: { color: colors.mutedLight, fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
  clearButton: { alignItems: 'center', height: 36, justifyContent: 'center', minWidth: 44, paddingHorizontal: 4 },
  filterActionHidden: { opacity: 0 },
  clear: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  saveFilter: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', marginBottom: 10, marginHorizontal: 16, minHeight: 48, paddingLeft: 13 },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, minHeight: 46, paddingHorizontal: 10, paddingVertical: 8 },
  searchClear: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  // Fixed height keeps the chip strip from jumping when a chip's fill/text style changes.
  filtersScroll: { flexGrow: 0, height: 60, marginBottom: 4 },
  savedFiltersScroll: { flexGrow: 0, marginBottom: 6 },
  savedFilters: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  savedLabel: { color: colors.mutedLight, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  savedChip: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, flexDirection: 'row', gap: 5, maxWidth: 170, minHeight: 34, paddingHorizontal: 11 },
  savedChipText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  groupChildren: { borderLeftColor: colors.primarySoft, borderLeftWidth: 3, marginLeft: 29 },
  filters: {
    alignItems: 'center',
    gap: 8,
    height: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterLoading: { alignItems: 'center', height: 40, justifyContent: 'center', width: 44 },
  // Top-aligned skeleton so placeholders sit where real cards will land.
  bootstrapLoading: { flex: 1 },
  filterListLoading: { alignSelf: 'stretch', flexGrow: 1, minHeight: 160, width: '100%' },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    maxWidth: 180,
    paddingHorizontal: 14,
  },
  chipSource: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipSourceActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipMuted: { opacity: 0.52 },
  // Keep weight/metrics identical across states so selection only repaints color.
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600', includeFontPadding: false, lineHeight: 16, textAlign: 'center' },
  chipSourceText: { color: colors.accent },
  chipTextActive: { color: colors.white },
  chipTextMuted: { color: colors.muted },
  list: { flexGrow: 1 },
  emptyList: { flexGrow: 1 },
  pagination: { alignItems: 'center', padding: 14 },
  loadMore: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, justifyContent: 'center', minHeight: 44, minWidth: 132, paddingHorizontal: 18 },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
  modalRoot: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 22 },
  modalBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.45)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.large, padding: 20, width: '100%' },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  modalBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  modalInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 15, marginTop: 16, minHeight: 50, paddingHorizontal: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalSecondary: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.medium, flex: 1, justifyContent: 'center', minHeight: 48 },
  modalSecondaryText: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  modalPrimary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flex: 1, justifyContent: 'center', minHeight: 48 },
  modalPrimaryText: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
