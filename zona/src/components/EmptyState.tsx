import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export function EmptyState({ title, message }: { title: string; message: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <AppIcon color={colors.primary} fallback="○" name="tray" size={27} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 38, paddingVertical: 66 },
  icon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, height: 58, justifyContent: 'center', marginBottom: 18, width: 58 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.2, marginBottom: 7 },
  message: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 280, textAlign: 'center' },
});
