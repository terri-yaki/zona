import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

/**
 * Placeholder rows for the inbox while the first content is loading. Uses a
 * gentle opacity pulse (no re-layout) and hides the block from assistive
 * technology so the screen's loading announcement remains the only one read.
 */
export function InboxSkeleton() {
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
      {Array.from({ length: 6 }).map((_, index) => (
        <Animated.View key={index} style={[styles.row, { opacity }]}>
          <View style={styles.avatar} />
          <View style={styles.content}>
            <View style={styles.meta} />
            <View style={styles.title} />
            <View style={styles.body} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: { flex: 1, paddingTop: 6 },
  row: {
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
  content: { flex: 1, gap: 8 },
  meta: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    height: 10,
    width: '40%',
  },
  title: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 14,
    width: '72%',
  },
  body: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.small,
    height: 10,
    width: '90%',
  },
});
