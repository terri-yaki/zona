import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

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
import { colors, radius } from '@/theme';
import type { AppOptions } from '@/types';

function relayLabel(health: PushRegistrationHealth | null) {
  if (!health) return 'Not checked yet';
  const labels: Record<PushRegistrationHealth['status'], string> = {
    registered: 'Registered',
    'not-granted': 'Permission needed',
    denied: 'Permission denied',
    simulator: 'Simulator preview',
    'expo-go': 'Expo Go preview',
    web: 'Web preview',
    unregistered: 'Not registered',
    error: 'Needs attention',
  };
  return labels[health.status];
}

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const bottomPad = useTabBarContentPadding(16);
  const userId = session?.user.id;
  const [permission, setPermission] = useState('Checking…');
  const [health, setHealth] = useState<PushRegistrationHealth | null>(null);
  const [registering, setRegistering] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [options, setOptions] = useState<AppOptions | null>(null);
  const [savingOption, setSavingOption] = useState<keyof AppOptionFlags | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [liveActivityCapability, setLiveActivityCapability] = useState<LiveActivityCapability | null>(null);
  const liveActivitySupported = liveActivityPlatformSupported();

  const refreshStatus = useCallback(async () => {
    if (!userId) return;
    setHealth(await getPushRegistrationHealth(userId));
    try {
      await migrateLegacyLiveActivityPreference(userId);
      setOptions(await getAppOptions(userId));
      setOptionsError(null);
    } catch (error) {
      setOptionsError(error instanceof Error ? error.message : 'Notification options could not be loaded.');
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
      setPermission('Web preview');
      return;
    }
    try {
      const result = await Notifications.getPermissionsAsync();
      setPermission(result.status);
    } catch {
      setPermission('Unavailable');
    }
  }, [liveActivitySupported, userId]);

  useFocusEffect(useCallback(() => { void refreshStatus(); }, [refreshStatus]));

  async function registerAgain() {
    if (!userId || registering) return;
    setRegistering(true);
    try {
      const status = await enablePushNotifications(userId);
      await refreshStatus();
      if (status === 'denied') {
        Alert.alert('Notifications are off', 'Allow notifications in iOS Settings to receive alerts when Zona is closed.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]);
      } else {
        Alert.alert(
          'Push status',
          status === 'registered'
            ? 'This iPhone is registered with the Zona relay.'
            : status === 'expo-go'
              ? 'The app works in Expo Go, but Apple remote push requires an EAS development or TestFlight build.'
              : `Current environment: ${status}.`,
        );
      }
    } catch (error) {
      await refreshStatus();
      Alert.alert('Registration failed', error instanceof Error ? error.message : 'Check your connection and try again.');
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
          await stopLiveActivity('Live Status off');
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
      setOptionsError(error instanceof Error ? error.message : 'The option could not be saved.');
    } finally {
      setSavingOption(null);
    }
  }

  async function localSignOut(showWarning: boolean) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      Alert.alert('Could not sign out', error.message);
      return;
    }
    if (showWarning) {
      Alert.alert('Signed out locally', 'The relay could not be reached, so this iPhone may continue receiving alerts until its registration expires or you sign in and retry removal.');
    }
  }

  async function signOut() {
    if (!userId || signingOut) return;
    if (session?.user.is_anonymous) {
      Alert.alert(
        'Sign out permanently?',
        'This private account has no email or password. Signing out cannot be undone: existing sources, tokens, and history are left behind and a fresh account is created next time.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: () => void performSignOut() },
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
        'Could not remove this iPhone',
        `${error instanceof Error ? error.message : 'The relay is unavailable.'}\n\nStay signed in and retry to stop push delivery, or sign out only on this device.`,
        [
          { text: 'Stay signed in', style: 'cancel' },
          { text: 'Sign out locally', style: 'destructive', onPress: () => void localSignOut(true) },
        ],
      );
    } finally {
      setSigningOut(false);
    }
  }

  function confirmDeletion() {
    if (deleting) return;
    Alert.alert('Delete your Zona account?', 'This permanently deletes all sources, tokens, notifications, and iPhone registrations. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void deleteAccount()
            .then(async () => {
              await supabase.auth.signOut({ scope: 'local' });
              router.replace('/sign-in');
            })
            .catch((error) => Alert.alert('Could not delete account', error instanceof Error ? error.message : 'Try again.'))
            .finally(() => setDeleting(false));
        },
      },
    ]);
  }

  const busy = signingOut || deleting;

  return (
    <TabScreen>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: bottomPad }]}
        style={styles.scroll}
      >
      <View style={styles.profile}>
        <View style={styles.profileIcon}><AppIcon color={colors.primary} fallback="•" name="person.crop.circle.fill" size={31} /></View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileTitle}>Your Zona account</Text>
          <Text numberOfLines={1} style={styles.profileEmail}>Private account on this iPhone</Text>
        </View>
      </View>

      <Text style={styles.section}>ACCOUNT</Text>
      <View style={styles.card}>
        <SettingRow icon="person" label="Account" value={userId ? `${userId.slice(0, 8)}…` : '—'} />
        <View style={styles.divider} />
        <SettingRow icon="clock" label="History retention" value="7 days" />
      </View>

      <Text style={styles.section}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        <OptionRow
          description="Save alerts to the inbox but stop remote push when disabled."
          disabled={!options || Boolean(savingOption)}
          label="Push alerts"
          onChange={(value) => void setOption('push_enabled', value)}
          value={options?.push_enabled ?? true}
        />
        <View style={styles.divider} />
        <OptionRow
          description="Play the normal iOS notification sound."
          disabled={!options || Boolean(savingOption) || !options.push_enabled}
          label="Notification sound"
          onChange={(value) => void setOption('play_sound', value)}
          value={options?.play_sound ?? true}
        />
        <View style={styles.divider} />
        <OptionRow
          description="Show alert and source text on the lock screen."
          disabled={!options || Boolean(savingOption) || !options.push_enabled}
          label="Message previews"
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
                  : 'Show unread alerts on the Lock Screen and Dynamic Island while Zona is open. Controlled here in Zona (not as a separate iPhone Settings button until a Live Activity–capable IPA is installed).'
              }
              disabled={!options || Boolean(savingOption)}
              label="Live Status"
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

      <Text style={styles.section}>IPHONE DELIVERY</Text>
      <View style={styles.card}>
        <SettingRow icon="bell" label="iOS permission" value={permission} />
        <View style={styles.divider} />
        <SettingRow icon="antenna.radiowaves.left.and.right" label="Zona relay" value={relayLabel(health)} />
        {health?.error ? <Text accessibilityLiveRegion="polite" style={styles.healthError}>{health.error}</Text> : null}
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" disabled={registering} onPress={registerAgain} style={({ pressed }) => [styles.registerRow, registering && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="↻" name="arrow.clockwise" size={17} /></View>
          <Text style={styles.link}>{registering ? 'Checking registration…' : 'Check and register this iPhone'}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
      </View>

      <Text style={styles.section}>APP</Text>
      <View style={styles.card}>
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
          <Text style={styles.link}>{checkingUpdate ? 'Checking for updates…' : 'Check for app update'}</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
      </View>

      <Text style={styles.section}>PRIVACY & ACCESS</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={({ pressed }) => [styles.registerRow, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><AppIcon color={colors.primary} fallback="i" name="hand.raised.fill" size={17} /></View>
          <Text style={styles.link}>Privacy and data use</Text>
          <AppIcon color={colors.mutedLight} fallback="›" name="chevron.right" size={13} />
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" disabled={busy} onPress={signOut} style={({ pressed }) => [styles.signOut, busy && styles.disabled, pressed && styles.pressed]}>
        <AppIcon color={colors.danger} fallback="←" name="rectangle.portrait.and.arrow.right" size={17} />
        <Text style={styles.signOutText}>{signingOut ? 'Removing this iPhone…' : 'Sign out'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDeletion} style={({ pressed }) => [styles.delete, busy && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.deleteText}>{deleting ? 'Deleting account…' : 'Delete account and data'}</Text>
      </Pressable>
      <Text style={styles.footnote}>Source credentials are stored as hashes and can be revoked independently.</Text>
      </ScrollView>
    </TabScreen>
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
  signOut: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 24, minHeight: 52, padding: 15 },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  delete: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: 6 },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
  footnote: { color: colors.mutedLight, fontSize: 11, lineHeight: 17, paddingHorizontal: 24, paddingVertical: 20, textAlign: 'center' },
});
