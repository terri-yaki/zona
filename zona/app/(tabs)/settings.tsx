import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { TabScreen, useTabBarContentPadding } from '@/components/TabScreen';
import { listNotifications, unreadNotificationCount } from '@/data/notifications';
import { getAppOptions, updateAppOptions, type AppOptionFlags } from '@/data/options';
import { deleteAccount } from '@/lib/api';
import { checkForAppUpdateInteractive } from '@/lib/app-updates';
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { languageAutonym, type LanguagePreference } from '@/i18n';
import { colors, radius } from '@/theme';
import type { AppOptions } from '@/types';

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { languageName, preference, setPreference, t } = useI18n();
  const bottomPad = useTabBarContentPadding(16);
  const userId = session?.user.id;
  const [permission, setPermission] = useState(t('settings.checking'));
  const [health, setHealth] = useState<PushRegistrationHealth | null>(null);
  const [registering, setRegistering] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [options, setOptions] = useState<AppOptions | null>(null);
  const [savingOption, setSavingOption] = useState<keyof AppOptionFlags | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [liveActivityCapability, setLiveActivityCapability] = useState<LiveActivityCapability | null>(null);
  const [languageModal, setLanguageModal] = useState(false);
  const liveActivitySupported = liveActivityPlatformSupported();

  const refreshStatus = useCallback(async () => {
    if (!userId) return;
    setHealth(await getPushRegistrationHealth(userId));
    try {
      await migrateLegacyLiveActivityPreference(userId);
      setOptions(await getAppOptions(userId));
      setOptionsError(null);
    } catch (error) {
      setOptionsError(error instanceof Error ? error.message : t('settings.optionsLoadError'));
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
    const previous = options;
    setOptions((current) => (current ? { ...current, [key]: value } : current));
    try {
      const next = await updateAppOptions(userId, { [key]: value });
      setOptions(next);
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

  function confirmDeletion() {
    if (deleting) return;
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAccount'),
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void deleteAccount()
            .then(async () => {
              await supabase.auth.signOut({ scope: 'local' });
              router.replace('/sign-in');
            })
            .catch((error) => Alert.alert(t('settings.deleteError'), error instanceof Error ? error.message : t('common.tryAgain')))
            .finally(() => setDeleting(false));
        },
      },
    ]);
  }

  const busy = signingOut || deleting;
  const relayStatus = health
    ? t(`settings.relay.${health.status === 'not-granted' ? 'notGranted' : health.status === 'expo-go' ? 'expoGo' : health.status}`)
    : t('settings.relay.notChecked');
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

  return (
    <TabScreen>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: bottomPad }]}
        style={styles.scroll}
      >
      <View style={styles.profile}>
        <View style={styles.profileIcon}><AppIcon color={colors.primary} fallback="•" name="person.crop.circle.fill" size={31} /></View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileTitle}>{t('settings.accountTitle')}</Text>
          <Text numberOfLines={1} style={styles.profileEmail}>{t('settings.privateAccount')}</Text>
        </View>
      </View>

      <Text style={styles.section}>{t('settings.sectionAccount')}</Text>
      <View style={styles.card}>
        <SettingRow icon="person" label={t('settings.account')} value={userId ? `${userId.slice(0, 8)}…` : '—'} />
        <View style={styles.divider} />
        <SettingRow icon="clock" label={t('settings.historyRetention')} value={t('common.sevenDays')} />
      </View>

      <Text style={styles.section}>{t('settings.sectionNotifications')}</Text>
      <View style={styles.card}>
        <OptionRow
          description={t('settings.pushAlertsDesc')}
          disabled={!options || Boolean(savingOption)}
          label={t('settings.pushAlerts')}
          onChange={(value) => void setOption('push_enabled', value)}
          value={options?.push_enabled ?? true}
        />
        <View style={styles.divider} />
        <OptionRow
          description={t('settings.soundDesc')}
          disabled={!options || Boolean(savingOption) || !options.push_enabled}
          label={t('settings.sound')}
          onChange={(value) => void setOption('play_sound', value)}
          value={options?.play_sound ?? true}
        />
        <View style={styles.divider} />
        <OptionRow
          description={t('settings.previewsDesc')}
          disabled={!options || Boolean(savingOption) || !options.push_enabled}
          label={t('settings.previews')}
          onChange={(value) => void setOption('show_preview', value)}
          value={options?.show_preview ?? true}
        />
        {liveActivitySupported ? (
          <>
            <View style={styles.divider} />
            <OptionRow
              description={
                liveActivityCapability && liveActivityCapability !== 'ready'
                  ? liveActivityCapabilityLabel(liveActivityCapability)
                  : t('settings.liveStatusDesc')
              }
              disabled={!options || Boolean(savingOption)}
              label={t('settings.liveStatus')}
              onChange={(value) => void setOption('live_activity_enabled', value)}
              value={options?.live_activity_enabled ?? false}
            />
            {liveActivityCapability && liveActivityCapability !== 'ready' ? (
              <Text accessibilityLiveRegion="polite" style={styles.liveActivityHint}>
                {liveActivityCapabilityLabel(liveActivityCapability)}
              </Text>
            ) : null}
          </>
        ) : null}
        {optionsError ? <Text accessibilityLiveRegion="polite" style={styles.optionsError}>{optionsError}</Text> : null}
      </View>

      <Text style={styles.section}>{t('settings.sectionDelivery')}</Text>
      <View style={styles.card}>
        <SettingRow icon="bell" label={t('settings.iosPermission')} value={permissionStatus} />
        <View style={styles.divider} />
        <SettingRow icon="antenna.radiowaves.left.and.right" label={t('settings.relay')} value={relayStatus} />
        {health?.error ? <Text accessibilityLiveRegion="polite" style={styles.healthError}>{health.error}</Text> : null}
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" disabled={registering} onPress={registerAgain} style={({ pressed }) => [styles.registerRow, registering && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="↻" name="arrow.clockwise" size={17} /></View>
          <Text style={styles.link}>{registering ? t('settings.checkingRegistration') : t('settings.checkRegistration')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
      </View>

      <Text style={styles.section}>{t('settings.sectionApp')}</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => setLanguageModal(true)} style={({ pressed }) => [styles.registerRow, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="A" name="globe" size={17} /></View>
          <Text style={styles.link}>{t('settings.language')}</Text>
          <Text numberOfLines={1} style={styles.languageValue}>{languageValue}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          disabled={checkingUpdate}
          onPress={() => {
            setCheckingUpdate(true);
            void checkForAppUpdateInteractive().finally(() => setCheckingUpdate(false));
          }}
          style={({ pressed }) => [styles.registerRow, checkingUpdate && styles.disabled, pressed && styles.pressed]}
        >
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="↓" name="arrow.down.circle" size={17} /></View>
          <Text style={styles.link}>{checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
      </View>

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
    </TabScreen>
  );
}

function LanguageModal({ onClose, onSelect, preference, visible }: {
  onClose: () => void;
  onSelect: (preference: LanguagePreference) => void;
  preference: LanguagePreference;
  visible: boolean;
}) {
  const { languageName, t } = useI18n();
  const choices: { label: string; value: LanguagePreference }[] = [
    { label: t('settings.languageSystemWithValue', { language: languageName }), value: 'system' },
    { label: 'English', value: 'en' },
    { label: '繁體中文', value: 'zh-Hant' },
  ];
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => undefined} style={styles.modalSheet}>
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

type SettingIcon = 'person' | 'clock' | 'bell' | 'antenna.radiowaves.left.and.right';

function SettingRow({ icon, label, value }: { icon: SettingIcon; label: string; value: string }) {
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

const styles = StyleSheet.create({
  scroll: { backgroundColor: colors.background, flex: 1 },
  page: { backgroundColor: colors.background, flexGrow: 1, paddingHorizontal: 16, paddingTop: 8 },
  profile: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.large, flexDirection: 'row', marginBottom: 7, padding: 17 },
  profileIcon: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 12, width: 44 },
  profileCopy: { flex: 1 },
  profileTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  profileEmail: { color: '#D8EAE4', fontSize: 12, marginTop: 3 },
  section: { color: colors.mutedLight, fontSize: 9, fontWeight: '800', letterSpacing: 0.9, marginBottom: 7, marginLeft: 5, marginTop: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 14 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 56 },
  rowIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 10, height: 34, justifyContent: 'center', marginRight: 11, width: 34 },
  label: { color: colors.textSoft, flex: 1, fontSize: 13, fontWeight: '600' },
  value: { color: colors.muted, flexShrink: 1, fontSize: 12, maxWidth: '52%' },
  divider: { backgroundColor: colors.border, height: 1, marginLeft: 45 },
  healthError: { color: colors.danger, fontSize: 11, lineHeight: 16, paddingBottom: 12, paddingLeft: 45 },
  optionRow: { alignItems: 'center', flexDirection: 'row', minHeight: 72, paddingVertical: 10 },
  optionCopy: { flex: 1, paddingRight: 12 },
  optionLabel: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  optionDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  liveActivityHint: { color: colors.accent, fontSize: 11, lineHeight: 16, paddingBottom: 12, paddingLeft: 0 },
  optionsError: { color: colors.danger, fontSize: 11, lineHeight: 16, paddingBottom: 12 },
  registerRow: { alignItems: 'center', flexDirection: 'row', minHeight: 56 },
  link: { color: colors.primary, flex: 1, fontSize: 13, fontWeight: '700' },
  languageValue: { color: colors.muted, fontSize: 12, marginRight: 8, maxWidth: '45%' },
  modalBackdrop: { backgroundColor: 'rgba(18, 35, 29, 0.3)', flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, paddingBottom: 34, paddingHorizontal: 18, paddingTop: 18 },
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
