import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, radius, shadows } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

/**
 * Placeholder chrome + rows for the inbox while content is loading. Uses a
 * gentle opacity pulse (no re-layout) and hides the block from assistive
 * technology so the screen's loading announcement remains the only one read.
 *
 * Layout mirrors the real inbox: optional summary / search / filter strip
 * (same margins and heights as index.tsx) then NotificationCard-shaped rows.
 * Pass `showChrome={false}` when those controls already sit above the list
 * (filter-change loading inside FlatList).
 */
export function InboxSkeleton({ showChrome = true }: { showChrome?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 900,
          toValue: 0.5,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 900,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.container}
    >
      {showChrome ? (
        <Animated.View style={{ opacity }}>
          <View style={styles.summary}>
            <View style={styles.summaryIcon} />
            <View style={styles.summaryCopy}>
              <View style={styles.summaryTitle} />
              <View style={styles.summaryCaption} />
            </View>
            <View style={styles.summaryAction} />
          </View>
          <View style={styles.searchBox} />
          <View style={styles.filterLabelRow}>
            <View style={styles.filterLabel} />
          </View>
          <View style={styles.filtersRow}>
            <View style={styles.chip} />
            <View style={styles.chip} />
            <View style={[styles.chip, styles.chipWide]} />
            <View style={styles.chip} />
          </View>
        </Animated.View>
      ) : null}

      {Array.from({ length: 6 }).map((_, index) => (
        <Animated.View key={index} style={[styles.row, { opacity }]}>
          <View style={styles.avatar} />
          <View style={styles.content}>
            <View style={styles.metaRow}>
              <View style={styles.metaSource} />
              <View style={styles.metaTime} />
            </View>
            <View style={styles.title} />
            <View style={styles.body} />
            <View style={styles.bodyShort} />
          </View>
          {index % 2 === 0 ? <View style={styles.dot} /> : null}
        </Animated.View>
      ))}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  // Top-aligned like the real FlatList, not vertically centered.
  container: { alignSelf: 'stretch', flexGrow: 1, width: '100%' },
  // Match index.tsx summary / search / filter metrics so the first paint
  // does not jump when real chrome replaces the placeholders.
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
  summaryIcon: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    height: 46,
    marginRight: 12,
    width: 46,
  },
  summaryCopy: { flex: 1, marginRight: 8 },
  summaryTitle: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 16,
    width: '58%',
  },
  summaryCaption: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 11,
    marginTop: 6,
    width: '42%',
  },
  summaryAction: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    height: 28,
    width: 72,
  },
  searchBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.medium,
    borderWidth: 1,
    height: 48,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  filterLabelRow: {
    height: 36,
    justifyContent: 'center',
    paddingBottom: 2,
    paddingHorizontal: 18,
  },
  filterLabel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 10,
    width: 52,
  },
  filtersRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: 60,
    marginBottom: 4,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    height: 40,
    width: 88,
  },
  chipWide: { width: 110 },
  // Match NotificationCard.card metrics (gap, padding, radius, margins).
  row: {
    ...shadows.card,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 15,
  },
  avatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 13,
    height: 44,
    width: 44,
  },
  content: { flex: 1 },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  metaSource: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    height: 10,
    width: '36%',
  },
  metaTime: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    height: 10,
    width: 40,
  },
  title: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 15,
    marginBottom: 3,
    width: '72%',
  },
  body: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 12,
    marginBottom: 4,
    width: '94%',
  },
  bodyShort: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 12,
    width: '62%',
  },
  dot: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
    height: 8,
    marginTop: 5,
    width: 8,
  },
});
