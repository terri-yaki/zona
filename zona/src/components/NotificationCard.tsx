import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { relativeTime, sourceInitial } from '@/lib/format';
import { severityAppearance } from '@/lib/notification-severity';
import { colors, radius, shadows } from '@/theme';
import type { InboxNotification } from '@/types';
import { useI18n } from '@/providers/LocalizationProvider';

export function NotificationCard({ item, onPress }: { item: InboxNotification; onPress: () => void }) {
  const { t } = useI18n();
  const unread = !item.read_at;
  const severity = severityAppearance(item.severity);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: severity.background, borderColor: severity.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.avatar, { borderColor: severity.border }]}>
        <Text style={styles.avatarText}>{sourceInitial(item.source_name_snapshot)}</Text>
        <View style={styles.bellBadge}>
          <AppIcon color={severity.icon} fallback="!" name="bell.fill" size={11} />
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.sourceRow}>
            <Text numberOfLines={1} style={styles.source}>{item.source_name_snapshot}</Text>
            {item.category ? <Text numberOfLines={1} style={styles.category}>{item.category}</Text> : null}
          </View>
          {item.attachment_path ? (
            <AppIcon color={colors.mutedLight} fallback="◈" name="photo" size={13} />
          ) : null}
          <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.title, unread && styles.unreadTitle]}>{item.title}</Text>
        <Text numberOfLines={2} style={styles.body}>{item.body}</Text>
      </View>
      {unread ? <View accessibilityLabel={t('inbox.unreadA11y')} style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { ...shadows.card, alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: '#E9EEEB', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 13, marginHorizontal: 16, marginVertical: 6, padding: 15 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
  avatar: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 13, borderWidth: 1, height: 44, justifyContent: 'center', position: 'relative', width: 44 },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  bellBadge: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 9, bottom: -4, height: 18, justifyContent: 'center', position: 'absolute', right: -4, width: 18 },
  content: { flex: 1 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 5 },
  sourceRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7 },
  source: { color: colors.primary, flexShrink: 1, fontSize: 12, fontWeight: '700' },
  category: { backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 9, fontWeight: '700', maxWidth: 90, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, textTransform: 'uppercase' },
  time: { color: colors.mutedLight, fontSize: 11 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 3 },
  unreadTitle: { fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  dot: { backgroundColor: colors.accent, borderRadius: 4, height: 8, marginTop: 5, width: 8 },
});
