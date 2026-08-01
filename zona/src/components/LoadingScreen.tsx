import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export function LoadingScreen({ message }: { message?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <View style={styles.indicator}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  indicator: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  message: { color: colors.muted, fontSize: 13, marginTop: 12 },
});
