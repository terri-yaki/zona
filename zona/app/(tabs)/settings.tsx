import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { clearCachedContent } from '@/cache/session';
import { getUserCacheSize } from '@/cache/store';
import { TabScreen, useBottomSafePadding, useTabBarContentPadding } from '@/components/TabScreen';
import { listNotifications, unreadNotificationCount } from '@/data/notifications';
import { getAppOptions, getCachedAppOptions, sanitizeAppOptions, updateAppOptions, type AppOptionFlags } from '@/data/options';
import { deleteAccount } from '@/lib/api';
import { clearPrivateUserState } from '@/cache/private-state';
import { checkForAppUpdateInteractive } from '@/lib/app-updates';
import { deliveryStatusVisible } from '@/lib/app-version';
import {
  advanceDeleteConfirmation,
  cancelDeleteConfirmation,
  canDeleteAccount,
  DELETE_CONFIRMATION_IDLE,
  type DeleteConfirmationStep,
} from '@/lib/delete-confirmation';
import {
  getLiveActivityCapability,
  liveActivityCapabilityLabel,
  liveActivityPlatformSupported,
  migrateLegacyLiveActivityPreference,
  stopLiveActivity,
  syncLiveActivity,
  type LiveActivityCapability,
} from '@/lib/live-activity';
import {
  enablePushNotifications,
  getPushRegistrationHealth,
  type PushRegistrationHealth,
  unregisterThisInstallation,
} from '@/lib/push';
import { relayStatusLabelKey } from '@/lib/push-platform';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { languageAutonym, type LanguagePreference } from '@/i18n';
import { runtimeString, type FeatureKey } from '@/lib/runtime-controls';
import { colors, radius } from '@/theme';
import { setActiveThemePreset, themePresets, useThemePreferenceId, useThemedStyles } from '@/theme-preference';
import type { AppOptions } from '@/types';

export default function SettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session } = useAuth();
  const { languageName, preference, setPreference, t, tc } = useI18n();
  const { snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const bottomPad = useTabBarContentPadding(16);
  const userId = session?.user.id;
  const [permission, setPermission] = useState(t('settings.checking'));
  const [health, setHealth] = useState<PushRegistrationHealth | null>(null);
  const [registering, setRegistering] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteConfirmationStep>(DELETE_CONFIRMATION_IDLE);
  const [options, setOptions] = useState<AppOptions | null>(null);
  const [optionsOwnerUserId, setOptionsOwnerUserId] = useState<string | null>(null);
  const [savingOption, setSavingOption] = useState<keyof AppOptionFlags | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [liveActivityCapability, setLiveActivityCapability] = useState<LiveActivityCapability | null>(null);
  const [languageModal, setLanguageModal] = useState(false);
  const [themeModal, setThemeModal] = useState(false);
  const activeThemeId = useThemePreferenceId();
  const activeTheme = themePresets.find((preset) => preset.id === activeThemeId) ?? themePresets[0];
  const [cacheBytes, setCacheBytes] = useState(0);
  const [cacheOwnerUserId, setCacheOwnerUserId] = useState<string | null>(null);
  const visibleOptions = optionsOwnerUserId === userId ? options : null;
  const visibleCacheBytes = cacheOwnerUserId === userId ? cacheBytes : 0;
  const liveActivitySupported = liveActivityPlatformSupported();
  const config = useMemo(() => ({
    userGuideUrl: runtimeString(snapshot, 'content.user_guide_url', 'https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc'),
    retentionDays: snapshot.limits.retentionDays,
  }), [snapshot]);

  const controlDescription = useCallback((key: FeatureKey, fallback: string) => (
    isEnabled(key) ? fallback : snapshot.features[key].reason || fallback
  ), [isEnabled, snapshot.features]);

  const refreshStatus = useCallback(async () => {
    if (!userId) return;
    void getUserCacheSize(userId).then((bytes) => {
      setCacheBytes(bytes);
      setCacheOwnerUserId(userId);
    }).catch(() => undefined);
    // The options load runs in its own branch: a hung push-health check or
    // legacy migration must never leave the notification toggles greyed out.
    // getAppOptions is itself bounded by withTimeout, so a hung RPC rejects
    // and the catch seeds safe enabled-by-default options instead of waiting
    // forever.
    void (async () => {
      try {
        const nextOptions = await getAppOptions(userId);
        setOptions(nextOptions);
        setOptionsOwnerUserId(userId);
        setOptionsError(null);
      } catch (error) {
        setOptions({ ...sanitizeAppOptions({}), user_id: userId });
        setOptionsOwnerUserId(userId);
        setOptionsError(error instanceof Error ? error.message : t('settings.optionsLoadError'));
      }
    })();
    try {
      setHealth(await getPushRegistrationHealth(userId));
    } catch {
      setHealth(null);
    }
    try {
      await migrateLegacyLiveActivityPreference(userId);
    } catch {
      // Migration failures must not block the rest of the status refresh.
    }
    if (liveActivitySupported) {
      try {
        setLiveActivityCapability(await getLiveActivityCapability());
      } catch {
        setLiveActivityCapability('native-missing');
      }
    } else {
      setLiveActivityCapability('unsupported');
    }
    if (Platform.OS === 'web') {
      setPermission(t('settings.webPreview'));
      return;
    }
    try {
      const result = await Notifications.getPermissionsAsync();
      setPermission(result.status);
    } catch {
      setPermission(t('common.unavailable'));
    }
  }, [liveActivitySupported, t, userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getCachedAppOptions(userId).then((cached) => {
      if (active && cached) {
        setOptions(cached);
        setOptionsOwnerUserId(userId);
      }
    }).catch(() => undefined);
    void getUserCacheSize(userId).then((bytes) => {
      if (active) {
        setCacheBytes(bytes);
        setCacheOwnerUserId(userId);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);

  useFocusEffect(useCallback(() => { void refreshStatus(); }, [refreshStatus]));

  async function registerAgain() {
    if (!userId || registering) return;
    setRegistering(true);
    try {
      const status = await enablePushNotifications(userId);
      await refreshStatus();
      if (status === 'denied') {
        Alert.alert(t('settings.notificationsOff'), t('settings.notificationsOffBody'), [
          { text: t('common.notNow'), style: 'cancel' },
          { text: t('settings.openSettings'), onPress: () => void Linking.openSettings() },
        ]);
      } else if (status === 'android-unconfigured') {
        Alert.alert(t('settings.androidConfigTitle'), t('settings.androidConfigBody'));
      } else {
        Alert.alert(
          t('settings.pushStatus'),
          status === 'registered'
            ? t('settings.registeredBody')
            : status === 'expo-go'
              ? t('settings.expoBody')
              : t('settings.environmentBody', { status }),
        );
      }
    } catch (error) {
      await refreshStatus();
      Alert.alert(t('settings.registrationFailed'), error instanceof Error ? error.message : t('error.connection'));
    } finally {
      setRegistering(false);
    }
  }

  async function setOption(key: keyof AppOptionFlags, value: boolean) {
    if (!userId || savingOption) return;
    setSavingOption(key);
    setOptionsError(null);
    const previous = visibleOptions;
    setOptions(previous ? { ...previous, [key]: value } : previous);
    setOptionsOwnerUserId(userId);
    try {
      const next = await updateAppOptions(userId, { [key]: value });
      setOptions(next);
      setOptionsOwnerUserId(userId);
      if (key === 'live_activity_enabled') {
        if (!value) {
          await stopLiveActivity(t('settings.liveStatus'));
        } else if (liveActivitySupported) {
          const unreadCount = await unreadNotificationCount();
          if (unreadCount > 0) {
            const { items } = await listNotifications({
              sourceId: null,
              since: null,
              unreadOnly: true,
            });
            const latest = items[0] ?? null;
            await syncLiveActivity(userId, {
              unreadCount,
              latestTitle: latest?.title ?? null,
              latestSource: latest?.source_name_snapshot ?? null,
              latestId: latest?.id ?? null,
              latestCreatedAt: latest?.created_at ?? null,
            });
          }
        }
      }
    } catch (error) {
      setOptions(previous);
      setOptionsError(error instanceof Error ? error.message : t('settings.optionSaveError'));
    } finally {
      setSavingOption(null);
    }
  }

  async function localSignOut(showWarning: boolean) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      Alert.alert(t('settings.signOutError'), error.message);
      return;
    }
    if (userId) await clearPrivateUserState(userId).catch(() => undefined);
    if (showWarning) {
      Alert.alert(t('settings.signedOutLocally'), t('settings.signedOutWarning'));
    }
  }

  async function signOut() {
    if (!userId || signingOut) return;
    if (session?.user.is_anonymous) {
      Alert.alert(
        t('settings.signOutPermanent'),
        t('settings.signOutPermanentBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('settings.signOut'), style: 'destructive', onPress: () => void performSignOut() },
        ],
      );
      return;
    }
    await performSignOut();
  }

  async function performSignOut() {
    if (!userId || signingOut) return;
    setSigningOut(true);
    try {
      await unregisterThisInstallation(userId);
      await localSignOut(false);
    } catch (error) {
      Alert.alert(
        t('settings.removePhoneError'),
        t('settings.removePhoneBody', { error: error instanceof Error ? error.message : t('settings.relayUnavailable') }),
        [
          { text: t('settings.staySignedIn'), style: 'cancel' },
          { text: t('settings.signOutLocally'), style: 'destructive', onPress: () => void localSignOut(true) },
        ],
      );
    } finally {
      setSigningOut(false);
    }
  }

  // Two consecutive explicit confirmations gate the destructive call; the
  // transitions live in the pure delete-confirmation unit. Canceling either
  // dialog resets the flow and no delete request can fire.
  function confirmDeletion() {
    if (!userId || deleting) return;
    const expectedUserId = userId;
    // The flow starts from the machine's current state (always idle here —
    // the modal alerts block re-entry, and cancel/delete reset it to idle).
    const firstStep = advanceDeleteConfirmation(deleteStep);
    setDeleteStep(firstStep);
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody', { accountId: expectedUserId }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setDeleteStep(cancelDeleteConfirmation()) },
      {
        text: t('settings.deleteContinue'),
        style: 'destructive',
        onPress: () => confirmDeletionFinal(expectedUserId, firstStep),
      },
    ]);
  }

  function confirmDeletionFinal(expectedUserId: string, step: DeleteConfirmationStep) {
    const armed = advanceDeleteConfirmation(step);
    setDeleteStep(armed);
    Alert.alert(t('settings.deleteFinalTitle'), t('settings.deleteFinalBody'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setDeleteStep(cancelDeleteConfirmation()) },
      {
        text: t('settings.deleteAccount'),
        style: 'destructive',
        onPress: () => void performAccountDelete(expectedUserId, armed),
      },
    ]);
  }

  async function performAccountDelete(expectedUserId: string, step: DeleteConfirmationStep) {
    if (!canDeleteAccount(step)) return;
    setDeleteStep(cancelDeleteConfirmation());
    setDeleting(true);
    try {
      const result = await deleteAccount(expectedUserId);
      if (result.userId !== expectedUserId) throw new Error(t('settings.deleteMismatch'));
      await supabase.auth.signOut({ scope: 'local' });
      await clearPrivateUserState(expectedUserId).catch(() => undefined);
      router.replace('/sign-in');
    } catch (error) {
      Alert.alert(t('settings.deleteError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setDeleting(false);
    }
  }

  function clearOfflineCache() {
    if (!userId) return;
    Alert.alert(t('settings.clearCacheTitle'), t('settings.clearCacheBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.clearCacheAction'),
        onPress: () => {
          void clearCachedContent(userId).then(() => {
            setCacheBytes(0);
            setCacheOwnerUserId(userId);
            Alert.alert(t('settings.clearCacheDone'));
          });
        },
      },
    ]);
  }

  const busy = signingOut || deleting;
  const relayStatus = t(relayStatusLabelKey(health?.status ?? null));
  const permissionStatus = permission === 'granted'
    ? t('settings.permission.granted')
    : permission === 'denied'
      ? t('settings.permission.denied')
      : permission === 'undetermined'
        ? t('settings.permission.undetermined')
        : permission;
  const languageValue = preference === 'system'
    ? t('settings.languageSystemWithValue', { language: languageName })
    : languageAutonym(preference);
  const showLanguage = isVisible('settings.language');
  const showTheme = isVisible('settings.theme');
  const showDeliveryStatus = deliveryStatusVisible() && isVisible('settings.delivery_status');
  const showWhatsNew = isVisible('settings.whats_new');
  const showManualUpdate = isVisible('settings.manual_update');
  const showUserGuide = isVisible('settings.user_guide');
  const showOfflineCache = isVisible('settings.offline_cache');
  const showAppStatus = isVisible('settings.app_status');
  const showFirstAlert = isVisible('onboarding.first_alert');
  const showAnyAppRow = showLanguage || showTheme || showWhatsNew || showManualUpdate
    || showUserGuide || showOfflineCache || showAppStatus || showFirstAlert;
  const showNotificationOptions = isVisible('settings.push')
    || isVisible('settings.sound')
    || isVisible('settings.preview')
    || (liveActivitySupported && isVisible('settings.live_activity'))
    || isVisible('settings.quiet_hours');
  return (
    <TabScreen>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: bottomPad }]}
        style={styles.scroll}
      >
      <Pressable accessibilityRole="button" onPress={() => router.push('/account' as never)} style={({ pressed }) => [styles.profile, pressed && styles.profilePressed]}>
        <View style={styles.profileIcon}><AppIcon color={colors.primary} fallback="•" name="person.crop.circle.fill" size={31} /></View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileTitle}>{t('settings.accountTitle')}</Text>
          <Text numberOfLines={1} style={styles.profileEmail}>{session?.user.is_anonymous ? t('settings.privateAccount') : session?.user.email ?? t('account.protectedTitle')}</Text>
        </View>
        <AppIcon color={colors.white} fallback="›" name="chevron.right" size={18} />
      </Pressable>

      {isVisible('settings.account_summary') ? <><Text style={styles.section}>{t('settings.sectionAccount')}</Text>
      <View style={[styles.card, !isEnabled('settings.account_summary') && styles.disabled]} pointerEvents={isEnabled('settings.account_summary') ? 'auto' : 'none'}>
        <SettingRow icon="person" label={t('settings.account')} value={userId ? `${userId.slice(0, 8)}…` : '—'} />
        <View style={styles.divider} />
        <SettingRow icon="clock" label={t('settings.historyRetention')} value={tc('settings.retentionDay', 'settings.retentionDays', config.retentionDays)} />
      </View></> : null}

      {showNotificationOptions ? <><Text style={styles.section}>{t('settings.sectionNotifications')}</Text>
      <View style={styles.card}>
        {isVisible('settings.push') ? (
          <OptionRow
            description={controlDescription('settings.push', t('settings.pushAlertsDesc'))}
            disabled={!visibleOptions || Boolean(savingOption) || !isEnabled('settings.push')}
            label={t('settings.pushAlerts')}
            onChange={(value) => void setOption('push_enabled', value)}
            value={visibleOptions?.push_enabled ?? true}
          />
        ) : null}
        {isVisible('settings.sound') ? (
          <>
            {isVisible('settings.push') ? <View style={styles.divider} /> : null}
            <OptionRow
              description={controlDescription('settings.sound', t('settings.soundDesc'))}
              disabled={!visibleOptions || Boolean(savingOption) || !visibleOptions.push_enabled || !isEnabled('settings.sound')}
              label={t('settings.sound')}
              onChange={(value) => void setOption('play_sound', value)}
              value={visibleOptions?.play_sound ?? true}
            />
          </>
        ) : null}
        {isVisible('settings.preview') ? (
          <>
            {isVisible('settings.push') || isVisible('settings.sound') ? <View style={styles.divider} /> : null}
            <OptionRow
              description={controlDescription('settings.preview', t('settings.previewsDesc'))}
              disabled={!visibleOptions || Boolean(savingOption) || !visibleOptions.push_enabled || !isEnabled('settings.preview')}
              label={t('settings.previews')}
              onChange={(value) => void setOption('show_preview', value)}
              value={visibleOptions?.show_preview ?? true}
            />
          </>
        ) : null}
        {liveActivitySupported && isVisible('settings.live_activity') ? (
          <>
            {isVisible('settings.push') || isVisible('settings.sound') || isVisible('settings.preview') ? <View style={styles.divider} /> : null}
            <OptionRow
              description={
                liveActivityCapability && liveActivityCapability !== 'ready'
                  ? liveActivityCapabilityLabel(liveActivityCapability)
                  : controlDescription('settings.live_activity', t('settings.liveStatusDesc'))
              }
              disabled={!visibleOptions || Boolean(savingOption) || !isEnabled('settings.live_activity')}
              label={t('settings.liveStatus')}
              onChange={(value) => void setOption('live_activity_enabled', value)}
              value={visibleOptions?.live_activity_enabled ?? false}
            />
            {liveActivityCapability && liveActivityCapability !== 'ready' ? (
              <Text accessibilityLiveRegion="polite" style={styles.liveActivityHint}>
                {liveActivityCapabilityLabel(liveActivityCapability)}
              </Text>
            ) : null}
          </>
        ) : null}
        {isVisible('settings.quiet_hours') ? <>
          {isVisible('settings.push') || isVisible('settings.sound') || isVisible('settings.preview') || (liveActivitySupported && isVisible('settings.live_activity')) ? <View style={styles.divider} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !isEnabled('settings.quiet_hours') }}
            disabled={!isEnabled('settings.quiet_hours')}
            onPress={() => router.push('/notification-schedule' as never)}
            style={({ pressed }) => [styles.optionRow, !isEnabled('settings.quiet_hours') && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.optionCopy}>
              <Text style={styles.optionLabel}>{t('settings.quietHours')}</Text>
              <Text style={styles.optionDescription}>
                {controlDescription('settings.quiet_hours', t('settings.quietHoursDesc'))}
              </Text>
            </View>
            <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
          </Pressable>
        </> : null}
        {optionsError ? <Text accessibilityLiveRegion="polite" style={styles.optionsError}>{optionsError}</Text> : null}
      </View></> : null}

      {showDeliveryStatus ? <><Text style={styles.section}>{t('settings.sectionDelivery')}</Text>
      <View style={styles.card}>
        <SettingRow icon="bell" label={t('settings.iosPermission')} value={permissionStatus} />
        <View style={styles.divider} />
        <SettingRow icon="antenna.radiowaves.left.and.right" label={t('settings.relay')} value={relayStatus} />
        {isVisible('settings.push_registration') ? <>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: registering || !isEnabled('settings.push_registration') }}
            disabled={registering || !isEnabled('settings.push_registration')}
            onPress={registerAgain}
            style={({ pressed }) => [styles.registerRow, (registering || !isEnabled('settings.push_registration')) && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="↻" name="arrow.clockwise" size={17} /></View>
            <Text style={styles.link}>{registering ? t('settings.checkingRegistration') : t('settings.checkRegistration')}</Text>
            <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
          </Pressable>
        </> : null}
      </View></> : null}

      {showAnyAppRow ? <><Text style={styles.section}>{t('settings.sectionApp')}</Text>
      <View style={styles.card}>
        {showLanguage ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isEnabled('settings.language') }} disabled={!isEnabled('settings.language')} onPress={() => setLanguageModal(true)} style={({ pressed }) => [styles.registerRow, !isEnabled('settings.language') && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="A" name="globe" size={17} /></View>
          <Text style={styles.link}>{t('settings.language')}</Text>
          <Text numberOfLines={1} style={styles.languageValue}>{languageValue}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable> : null}
        {showTheme && showLanguage ? <View style={styles.divider} /> : null}
        {showTheme ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isEnabled('settings.theme') }} disabled={!isEnabled('settings.theme')} onPress={() => setThemeModal(true)} style={({ pressed }) => [styles.registerRow, !isEnabled('settings.theme') && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="◐" name="paintpalette" size={17} /></View>
          <Text style={styles.link}>{t('settings.theme')}</Text>
          <Text numberOfLines={1} style={styles.languageValue}>{t(activeTheme.nameKey)}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable> : null}
        {showWhatsNew ? <>{showLanguage || showTheme ? <View style={styles.divider} /> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isEnabled('settings.whats_new') }} disabled={!isEnabled('settings.whats_new')} onPress={() => router.push('/whats-new')} style={({ pressed }) => [styles.registerRow, !isEnabled('settings.whats_new') && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.accent} fallback="+" name="sparkles" size={17} /></View>
          <Text style={styles.link}>{t('settings.whatsNew')}</Text>
          <Text numberOfLines={1} style={styles.languageValue}>{t('settings.whatsNewValue')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable></> : null}
        {showManualUpdate ? <>{showLanguage || showTheme || showWhatsNew ? <View style={styles.divider} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: checkingUpdate || !isEnabled('settings.manual_update') }}
          disabled={checkingUpdate || !isEnabled('settings.manual_update')}
          onPress={() => {
            setCheckingUpdate(true);
            void checkForAppUpdateInteractive().finally(() => setCheckingUpdate(false));
          }}
          style={({ pressed }) => [styles.registerRow, (checkingUpdate || !isEnabled('settings.manual_update')) && styles.disabled, pressed && styles.pressed]}
        >
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="↓" name="arrow.down.circle" size={17} /></View>
          <Text style={styles.link}>{checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable></> : null}
        {showUserGuide ? <>{showLanguage || showTheme || showWhatsNew || showManualUpdate ? <View style={styles.divider} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !isEnabled('settings.user_guide') }}
          disabled={!isEnabled('settings.user_guide')}
          onPress={() => Linking.openURL(config.userGuideUrl)}
          style={({ pressed }) => [styles.registerRow, !isEnabled('settings.user_guide') && styles.disabled, pressed && styles.pressed]}
        >
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="?" name="book" size={17} /></View>
          <Text style={styles.link}>{t('settings.userGuide')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable></> : null}
        {showOfflineCache ? <>{showLanguage || showTheme || showWhatsNew || showManualUpdate || showUserGuide ? <View style={styles.divider} /> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isEnabled('settings.offline_cache') }} disabled={!isEnabled('settings.offline_cache')} onPress={clearOfflineCache} style={({ pressed }) => [styles.registerRow, !isEnabled('settings.offline_cache') && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="□" name="internaldrive" size={17} /></View>
          <Text style={styles.link}>{t('settings.offlineCache')}</Text>
          <Text numberOfLines={1} style={styles.languageValue}>{formatCacheSize(visibleCacheBytes)}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable></> : null}
        {showAppStatus ? <>{showLanguage || showTheme || showWhatsNew || showManualUpdate || showUserGuide || showOfflineCache ? <View style={styles.divider} /> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isEnabled('settings.app_status') }} disabled={!isEnabled('settings.app_status')} onPress={() => router.push('/app-status' as never)} style={({ pressed }) => [styles.registerRow, !isEnabled('settings.app_status') && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="i" name="waveform.path.ecg" size={17} /></View>
          <Text style={styles.link}>{t('settings.appStatus')}</Text>
          <Text numberOfLines={1} style={styles.languageValue}>{snapshot.releasePolicy.maintenanceMode ? t('settings.appStatusLimited') : t('settings.appStatusReady')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable></> : null}
        {showFirstAlert ? <>{showLanguage || showTheme || showWhatsNew || showManualUpdate || showUserGuide || showOfflineCache || showAppStatus ? <View style={styles.divider} /> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isEnabled('onboarding.first_alert') }} disabled={!isEnabled('onboarding.first_alert')} onPress={() => router.push('/first-alert' as never)} style={({ pressed }) => [styles.registerRow, !isEnabled('onboarding.first_alert') && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.accent} fallback="1" name="paperplane.fill" size={17} /></View>
          <Text style={styles.link}>{t('settings.firstAlert')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable></> : null}
      </View></> : null}

      <Text style={styles.section}>{t('settings.sectionPrivacy')}</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={({ pressed }) => [styles.registerRow, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="i" name="hand.raised.fill" size={17} /></View>
          <Text style={styles.link}>{t('settings.privacy')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" disabled={busy} onPress={signOut} style={({ pressed }) => [styles.signOut, busy && styles.disabled, pressed && styles.pressed]}>
        <AppIcon color={colors.danger} fallback="←" name="rectangle.portrait.and.arrow.right" size={17} />
        <Text style={styles.signOutText}>{signingOut ? t('settings.removing') : t('settings.signOut')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDeletion} style={({ pressed }) => [styles.delete, busy && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.deleteText}>{deleting ? t('settings.deletingAccount') : t('settings.deleteAccountData')}</Text>
      </Pressable>
      <Text style={styles.footnote}>{t('settings.footnote')}</Text>
      </ScrollView>
      <LanguageModal
        onClose={() => setLanguageModal(false)}
        onSelect={(next) => { void setPreference(next); setLanguageModal(false); }}
        preference={preference}
        visible={languageModal}
      />
      <ThemeModal
        activeThemeId={activeThemeId}
        onClose={() => setThemeModal(false)}
        onSelect={(id) => { void setActiveThemePreset(id); setThemeModal(false); }}
        visible={themeModal}
      />
    </TabScreen>
  );
}

function formatCacheSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LanguageModal({ onClose, onSelect, preference, visible }: {
  onClose: () => void;
  onSelect: (preference: LanguagePreference) => void;
  preference: LanguagePreference;
  visible: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { languageName, t } = useI18n();
  const bottomPadding = useBottomSafePadding(14);
  const choices: { label: string; value: LanguagePreference }[] = [
    { label: t('settings.languageSystemWithValue', { language: languageName }), value: 'system' },
    { label: 'English', value: 'en' },
    { label: '繁體中文', value: 'zh-Hant' },
  ];
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop}>
        <Pressable accessibilityViewIsModal onPress={() => undefined} style={[styles.modalSheet, { paddingBottom: bottomPadding }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{t('settings.languageTitle')}</Text>
              <Text style={styles.modalBody}>{t('settings.languageBody')}</Text>
            </View>
            <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.modalClose}>
              <AppIcon color={colors.textSoft} fallback="×" name="xmark" size={16} />
            </Pressable>
          </View>
          {choices.map((choice) => (
            <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: preference === choice.value }} onPress={() => onSelect(choice.value)} style={({ pressed }) => [styles.languageChoice, pressed && styles.pressed]}>
              <Text style={styles.languageChoiceText}>{choice.label}</Text>
              {preference === choice.value ? <AppIcon color={colors.primary} fallback="✓" name="checkmark.circle.fill" size={20} /> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ThemeModal({ activeThemeId, onClose, onSelect, visible }: {
  activeThemeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  visible: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  const bottomPadding = useBottomSafePadding(14);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop}>
        <Pressable accessibilityViewIsModal onPress={() => undefined} style={[styles.modalSheet, { paddingBottom: bottomPadding }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{t('settings.themeTitle')}</Text>
              <Text style={styles.modalBody}>{t('settings.themeBody')}</Text>
            </View>
            <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={styles.modalClose}>
              <AppIcon color={colors.textSoft} fallback="×" name="xmark" size={16} />
            </Pressable>
          </View>
          {themePresets.map((preset) => (
            <Pressable key={preset.id} accessibilityRole="radio" accessibilityState={{ checked: activeThemeId === preset.id }} onPress={() => onSelect(preset.id)} style={({ pressed }) => [styles.languageChoice, pressed && styles.pressed]}>
              <View style={[styles.themeDot, { backgroundColor: preset.colors.primary }]} />
              <Text style={styles.languageChoiceText}>{t(preset.nameKey)}</Text>
              {activeThemeId === preset.id ? <AppIcon color={colors.primary} fallback="✓" name="checkmark.circle.fill" size={20} /> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type SettingIcon = 'person' | 'clock' | 'bell' | 'antenna.radiowaves.left.and.right';

function SettingRow({ icon, label, value }: { icon: SettingIcon; label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="•" name={icon} size={17} /></View>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} style={styles.value}>{value}</Text>
    </View>
  );
}

function OptionRow({ description, disabled, label, onChange, value }: {
  description: string;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.optionRow}>
      <View style={styles.optionCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onChange}
        thumbColor={value ? colors.primary : colors.mutedLight}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        value={value}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  scroll: { backgroundColor: colors.background, flex: 1 },
  page: { backgroundColor: colors.background, flexGrow: 1, paddingHorizontal: 16, paddingTop: 8 },
  profile: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.large, flexDirection: 'row', marginBottom: 7, padding: 17 },
  profilePressed: { backgroundColor: colors.primaryDark },
  profileIcon: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 12, width: 44 },
  profileCopy: { flex: 1 },
  profileTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  // White on the primary profile header: primarySoft-on-primary fails WCAG AA
  // in dark presets (neon ~3.1:1), so the header keeps white-only text.
  profileEmail: { color: colors.white, fontSize: 12, marginTop: 3 },
  section: { color: colors.mutedLight, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 7, marginLeft: 5, marginTop: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 14 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 56 },
  rowIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 10, height: 34, justifyContent: 'center', marginRight: 11, width: 34 },
  label: { color: colors.textSoft, flex: 1, fontSize: 13, fontWeight: '600' },
  value: { color: colors.muted, flexShrink: 1, fontSize: 12, maxWidth: '52%' },
  divider: { backgroundColor: colors.border, height: 1, marginLeft: 45 },
  optionRow: { alignItems: 'center', flexDirection: 'row', minHeight: 72, paddingVertical: 10 },
  optionCopy: { flex: 1, paddingRight: 12 },
  optionLabel: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  optionDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  liveActivityHint: { color: colors.accent, fontSize: 11, lineHeight: 16, paddingBottom: 12, paddingLeft: 0 },
  optionsError: { color: colors.danger, fontSize: 11, lineHeight: 16, paddingBottom: 12 },
  registerRow: { alignItems: 'center', flexDirection: 'row', minHeight: 56 },
  link: { color: colors.primaryText, flex: 1, fontSize: 13, fontWeight: '700' },
  cacheCopy: { flex: 1, paddingRight: 8 },
  cacheDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  languageValue: { color: colors.muted, fontSize: 12, marginRight: 8, maxWidth: '45%' },
  themeDot: { borderRadius: 999, height: 18, marginRight: 10, width: 18 },
  modalBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)', flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, paddingHorizontal: 18, paddingTop: 18 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  modalBody: { color: colors.muted, fontSize: 12, marginTop: 4 },
  modalClose: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  languageChoice: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', minHeight: 56, paddingHorizontal: 4 },
  languageChoiceText: { color: colors.textSoft, flex: 1, fontSize: 15, fontWeight: '600' },
  signOut: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 24, minHeight: 52, padding: 15 },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  delete: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: 6 },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
  footnote: { color: colors.mutedLight, fontSize: 11, lineHeight: 17, paddingHorizontal: 24, paddingVertical: 20, textAlign: 'center' },
});
