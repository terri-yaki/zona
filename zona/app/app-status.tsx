import Constants from 'expo-constants';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { useBottomSafePadding } from '@/components/TabScreen';
import { relativeTime } from '@/lib/format';
import { featureKeys, runtimeBoolean, runtimeNumber, runtimeString } from '@/lib/runtime-controls';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { colors, radius, shadows } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export default function AppStatusScreen() {
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { t, tc } = useI18n();
  const { error, fetchedAt, loading, refresh, snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const [openedAt] = useState(Date.now);
  const paddingBottom = useBottomSafePadding(24);
  if (!session) return <Redirect href="/sign-in" />;
  if (!isVisible('settings.app_status')) return <Redirect href="/(tabs)/settings" />;

  const counts = featureKeys.reduce((result, key) => {
    result[snapshot.features[key].mode] += 1;
    return result;
  }, { disabled: 0, enabled: 0, hidden: 0, read_only: 0 });
  const limitedCount = counts.disabled + counts.hidden + counts.read_only;
  const staleAfterMs = runtimeNumber(snapshot, 'status.config_stale_after_seconds', 900, 60, 86400) * 1_000;
  const stale = !fetchedAt || openedAt - fetchedAt > staleAfterMs;
  const configuredSupportUrl = runtimeString(snapshot, 'content.support_url', 'https://github.com/terri-yaki/zona/issues');
  const supportUrl = /^https:\/\//i.test(configuredSupportUrl)
    ? configuredSupportUrl
    : 'https://github.com/terri-yaki/zona/issues';
  const showRevision = runtimeBoolean(snapshot, 'status.show_internal_revision', false);
  const status = snapshot.releasePolicy.maintenanceMode
    ? 'maintenance'
    : error || stale
      ? 'attention'
      : limitedCount
        ? 'limited'
        : 'ready';
  const statusColor = status === 'ready' ? colors.success : status === 'attention' || status === 'maintenance' ? colors.danger : colors.accent;

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom }]}>
      <View style={styles.hero}>
        <View style={[styles.statusMark, { backgroundColor: statusColor }]} />
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{t(`appStatus.${status}.title`)}</Text>
          <Text style={styles.body}>{t(`appStatus.${status}.body`)}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: loading }}
        disabled={loading}
        onPress={() => void refresh()}
        style={({ pressed }) => [styles.refresh, pressed && styles.pressed, loading && styles.disabled]}
      >
        <AppIcon color={colors.primary} fallback="R" name="arrow.clockwise" size={17} />
        <Text style={styles.refreshText}>{loading ? t('appStatus.refreshing') : t('appStatus.refresh')}</Text>
        <Text style={styles.refreshTime}>{fetchedAt ? relativeTime(new Date(fetchedAt).toISOString()) : t('appStatus.notSynced')}</Text>
      </Pressable>

      {isVisible('status.control_summary') ? <>
        <Text style={styles.section}>{t('appStatus.controls')}</Text>
        <View style={[styles.card, !isEnabled('status.control_summary') && styles.disabled]}>
          <StatusMetric label={t('appStatus.available')} value={counts.enabled} />
          <StatusMetric label={t('appStatus.temporarilyLimited')} value={limitedCount} />
          <StatusMetric label={t('appStatus.notices')} value={snapshot.announcements.length} />
        </View>
      </> : null}

      {isVisible('status.plan_limits') ? <>
        <Text style={styles.section}>{t('appStatus.accountCapacity')}</Text>
        <View style={[styles.listCard, !isEnabled('status.plan_limits') && styles.disabled]}>
          <StatusRow label={t('appStatus.plan')} value={snapshot.tier === 'premium' ? t('appStatus.plus') : t('appStatus.standard')} />
          <View style={styles.divider} />
          <StatusRow label={t('appStatus.history')} value={tc('settings.retentionDay', 'settings.retentionDays', snapshot.limits.retentionDays)} />
          <View style={styles.divider} />
          <StatusRow label={t('appStatus.sourceKeys')} value={String(snapshot.limits.maxSourceKeys)} />
          <View style={styles.divider} />
          <StatusRow label={t('appStatus.phones')} value={String(snapshot.limits.maxPushDevices)} />
        </View>
      </> : null}

      {isVisible('status.configuration_details') ? <>
        <Text style={styles.section}>{t('appStatus.thisApp')}</Text>
        <View style={[styles.listCard, !isEnabled('status.configuration_details') && styles.disabled]}>
          <StatusRow label={t('appStatus.version')} value={`${Constants.expoConfig?.version ?? '—'} (${Constants.nativeBuildVersion ?? '—'})`} />
          <View style={styles.divider} />
          <StatusRow label={t('appStatus.platform')} value={Platform.OS} />
          {showRevision ? <><View style={styles.divider} /><StatusRow label={t('appStatus.revision')} value={String(snapshot.revision)} /></> : null}
        </View>
      </> : null}

      {isVisible('status.support_link') ? <Pressable
        accessibilityRole="link"
        accessibilityState={{ disabled: !isEnabled('status.support_link') }}
        disabled={!isEnabled('status.support_link')}
        onPress={() => void Linking.openURL(supportUrl)}
        style={({ pressed }) => [styles.support, pressed && styles.pressed, !isEnabled('status.support_link') && styles.disabled]}
      >
        <View style={styles.supportIcon}><AppIcon color={colors.primary} fallback="?" name="lifepreserver" size={19} /></View>
        <View style={styles.supportCopy}>
          <Text style={styles.supportTitle}>{t('appStatus.support')}</Text>
          <Text style={styles.supportBody}>{t('appStatus.supportBody')}</Text>
        </View>
        <AppIcon color={colors.mutedLight} fallback=">" name="arrow.up.right" size={14} />
      </Pressable> : null}
    </ScrollView>
  );
}

function StatusMetric({ label, value }: { label: string; value: number }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text numberOfLines={1} style={styles.rowValue}>{value}</Text></View>;
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
  hero: { alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, flexDirection: 'row', gap: 13, padding: 18, ...shadows.card },
  statusMark: { borderColor: colors.surface, borderRadius: radius.full, borderWidth: 4, height: 22, marginTop: 3, width: 22 },
  heroCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  refresh: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 9, minHeight: 52, paddingHorizontal: 6 },
  refreshText: { color: colors.primary, flex: 1, fontSize: 13, fontWeight: '700' },
  refreshTime: { color: colors.muted, fontSize: 12 },
  section: { color: colors.mutedLight, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4, marginTop: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  metric: { alignItems: 'flex-start', flex: 1, minWidth: 0, padding: 14 },
  metricValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  metricLabel: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 14 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 54 },
  rowLabel: { color: colors.textSoft, flex: 1, fontSize: 13, fontWeight: '600' },
  rowValue: { color: colors.muted, flexShrink: 1, fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  divider: { backgroundColor: colors.border, height: 1 },
  support: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: 11, marginTop: 22, minHeight: 68, padding: 13 },
  supportIcon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  supportCopy: { flex: 1, minWidth: 0 },
  supportTitle: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  supportBody: { color: colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 2 },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.5 },
});
