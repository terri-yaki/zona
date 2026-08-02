import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export function RuntimeStatusBanner() {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  const { session } = useAuth();
  const { snapshot } = useRuntimeConfig();
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const ownerUserId = session?.user.id;
  const keyFor = useCallback((id: string) => `${ownerUserId}.${id}`, [ownerUserId]);
  // First non-dismissed announcement wins, so dismissing one reveals the next.
  const announcement = ownerUserId
    ? snapshot.announcements.find((item) => !dismissedKeys.includes(keyFor(item.id))) ?? null
    : snapshot.announcements[0] ?? null;
  const maintenance = snapshot.releasePolicy.maintenanceMode;
  const buildNumber = Number.parseInt(Constants.nativeBuildVersion ?? '0', 10) || 0;
  const updateRequired = snapshot.releasePolicy.updateMode === 'hard'
    && buildNumber < snapshot.releasePolicy.minimumBuildNumber;
  const updateRecommended = snapshot.releasePolicy.updateMode === 'soft'
    && buildNumber < snapshot.releasePolicy.recommendedBuildNumber;
  const updateAvailable = updateRequired || updateRecommended;

  useEffect(() => {
    if (!announcement?.isDismissible || !ownerUserId) return;
    const key = `zona.runtime-announcement.dismissed.${ownerUserId}.${announcement.id}`;
    void AsyncStorage.getItem(key)
      .then((value) => {
        if (value === '1') {
          setDismissedKeys((prev) => (prev.includes(keyFor(announcement.id)) ? prev : [...prev, keyFor(announcement.id)]));
        }
      })
      .catch((error) => console.warn('Could not read the dismissed announcement.', error));
  }, [announcement?.id, announcement?.isDismissible, ownerUserId, keyFor]);

  if (!maintenance && !updateAvailable && !announcement) return null;

  const critical = maintenance || updateRequired || announcement?.tone === 'critical';
  const warning = announcement?.tone === 'warning';
  const title = maintenance
    ? t('runtime.maintenanceTitle')
    : updateAvailable
    ? t('runtime.updateTitle')
    : announcement!.title;
  const body = maintenance
    ? snapshot.releasePolicy.message || t('runtime.maintenanceBody')
    : updateAvailable
    ? snapshot.releasePolicy.message || t('runtime.updateBody')
    : announcement!.body;
  const actionUrl = maintenance || updateAvailable ? snapshot.releasePolicy.storeUrl : announcement?.actionUrl;
  const actionLabel = maintenance || updateAvailable ? null : announcement?.actionLabel;

  async function dismissAnnouncement() {
    if (!announcement?.isDismissible || !ownerUserId) return;
    setDismissedKeys((prev) => [...prev, keyFor(announcement.id)]);
    try {
      await AsyncStorage.setItem(`zona.runtime-announcement.dismissed.${ownerUserId}.${announcement.id}`, '1');
    } catch (error) {
      console.warn('Could not persist the dismissed announcement.', error);
    }
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.banner, critical && styles.critical, warning && styles.warning]}
    >
      <AppIcon
        color={critical ? colors.danger : warning ? colors.accent : colors.primary}
        fallback="!"
        name={critical ? 'exclamationmark.triangle.fill' : 'info.circle.fill'}
        size={17}
      />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {actionUrl ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(actionUrl)} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel || t('runtime.open')}</Text>
        </Pressable>
      ) : null}
      {!maintenance && !updateAvailable && announcement?.isDismissible ? (
        <Pressable
          accessibilityLabel={t('runtime.dismiss')}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => void dismissAnnouncement()}
          style={styles.dismiss}
        >
          <AppIcon color={colors.muted} fallback="×" name="xmark" size={13} />
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  banner: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 8, marginHorizontal: 16, marginTop: 6, padding: 12 },
  warning: { backgroundColor: colors.accentSoft },
  critical: { backgroundColor: colors.dangerSoft },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: '800' },
  body: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 2 },
  action: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 6, paddingVertical: 8 },
  actionText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  dismiss: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, minWidth: 44 },
});
