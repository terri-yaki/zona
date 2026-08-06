import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { relativeTime, sourceInitial } from '@/lib/format';
import { getLocaleTag } from '@/i18n';
import { severityAppearance } from '@/lib/notification-severity';
import { runtimeChoice, runtimeNumber } from '@/lib/runtime-controls';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { colors, radius, shadows } from '@/theme';
import type { InboxNotification } from '@/types';
import { useI18n } from '@/providers/LocalizationProvider';
import { useThemedStyles } from '@/theme-preference';

export function NotificationCard({ item, onPress, repeatCount = 1 }: { item: InboxNotification; onPress: () => void; repeatCount?: number }) {
  const styles = useThemedStyles(createStyles);
  const { language, t } = useI18n();
  const { snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const unread = !item.read_at;
  const showSeverity = isVisible('notification.severity') && isEnabled('notification.severity');
  const severity = severityAppearance(showSeverity ? item.severity : null);
  const titleLines = runtimeNumber(snapshot, 'inbox.card_title_lines', 1, 1, 2);
  const bodyLines = runtimeNumber(snapshot, 'inbox.card_body_lines', 2, 1, 4);
  const cardSpacing = runtimeNumber(snapshot, 'inbox.card_spacing', 6, 2, 12);
  const density = runtimeChoice(snapshot, 'ui.density', ['comfortable', 'compact'] as const, 'comfortable');
  const showCategory = isVisible('inbox.category_badges') && isEnabled('inbox.category_badges');
  const showAttachment = isVisible('inbox.attachment_badges') && isEnabled('inbox.attachment_badges');
  const useRelativeTime = isVisible('inbox.relative_time') && isEnabled('inbox.relative_time');
  const timeLabel = useRelativeTime
    ? relativeTime(item.created_at)
    : new Date(item.created_at).toLocaleString(getLocaleTag(language), {
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
      });
  const accessibilityLabel = [
    item.source_name_snapshot,
    item.title,
    item.body,
    timeLabel,
    unread ? t('inbox.unreadA11y') : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        density === 'compact' && styles.cardCompact,
        { marginVertical: cardSpacing },
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
            {item.pinned_at ? <AppIcon color={colors.accent} fallback="P" name="pin.fill" size={12} /> : null}
            {item.category && showCategory ? <Text numberOfLines={1} style={styles.category}>{item.category}</Text> : null}
          </View>
          {item.attachment_path && showAttachment ? (
            <AppIcon color={colors.mutedLight} fallback="◈" name="photo" size={13} />
          ) : null}
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
        <View style={styles.titleRow}>
          <Text numberOfLines={titleLines} style={[styles.title, unread && styles.unreadTitle]}>{item.title}</Text>
          {repeatCount > 1 ? <Text style={styles.repeatCount}>×{repeatCount}</Text> : null}
        </View>
        <Text numberOfLines={bodyLines} style={styles.body}>{item.body}</Text>
      </View>
      {unread ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dot} /> : null}
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  card: { ...shadows.card, alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 13, marginHorizontal: 16, marginVertical: 6, padding: 15 },
  cardCompact: { gap: 10, paddingHorizontal: 13, paddingVertical: 11 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
  // Invariant: avatar uses a `colors.primarySoft` background + `colors.primaryText`
  // foreground, a pairing locked at >= 4.5:1 for every preset by the contrast
  // test; the badge uses a surfaced outline so it reads on dark neon cards.
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 13, borderWidth: 1, height: 44, justifyContent: 'center', position: 'relative', width: 44 },
  avatarText: { color: colors.primaryText, fontSize: 17, fontWeight: '800' },
  bellBadge: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 9, borderWidth: 1, bottom: -4, height: 18, justifyContent: 'center', position: 'absolute', right: -4, width: 18 },
  content: { flex: 1 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 5 },
  sourceRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7 },
  source: { color: colors.primaryText, flexShrink: 1, fontSize: 12, fontWeight: '700' },
  category: { backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 11, fontWeight: '700', maxWidth: 110, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, textTransform: 'uppercase' },
  time: { color: colors.mutedLight, fontSize: 11 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 3 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  repeatCount: { backgroundColor: colors.primarySoft, borderRadius: radius.full, color: colors.primaryText, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2 },
  unreadTitle: { fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  dot: { backgroundColor: colors.accent, borderRadius: 4, height: 8, marginTop: 5, width: 8 },
});
