import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { userMessage } from '@/lib/errors';
import { colors, radius } from '@/theme';
import { useI18n } from '@/providers/LocalizationProvider';
import { useThemedStyles } from '@/theme-preference';

export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry: () => void; compact?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.container, compact && styles.compact]}>
      <View style={styles.icon}><AppIcon color={colors.danger} fallback="!" name="exclamationmark.triangle.fill" size={20} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('error.loadTitle')}</Text>
        <Text style={styles.message}>{userMessage(error)}</Text>
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderColor: '#EECFCD', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 10, margin: 16, padding: 14 },
  compact: { marginBottom: 8, marginTop: 4 },
  icon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  copy: { flex: 1 },
  title: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  message: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 2 },
  retry: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.small, minHeight: 36, justifyContent: 'center', paddingHorizontal: 12 },
  retryText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
