import type { UserIdentity } from '@supabase/supabase-js';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearPrivateUserState } from '@/cache/private-state';
import { AppIcon } from '@/components/AppIcon';
import {
  bindCurrentInstallation,
  getAccountUsage,
  getAccountSummary,
  listAccountInstallations,
  revokeAccountInstallation,
  revokeOtherAccountInstallations,
  type AccountInstallation,
  type AccountSummary,
} from '@/data/account';
import { getAuthCapabilities, type AuthCapabilities } from '@/lib/auth-capabilities';
import { formatAccountUsageBytes, type AccountUsage } from '@/lib/account-usage';
import { relativeTime } from '@/lib/format';
import { unregisterThisInstallation } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { AuthProviderName } from '@/lib/auth-transactions';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

const providerNames: Record<string, string> = {
  apple: 'Apple',
  email: 'Email',
  github: 'GitHub',
  google: 'Google',
};

function identityHint(identity: UserIdentity) {
  const details = identity.identity_data ?? {};
  const email = typeof details.email === 'string' ? details.email : null;
  return email;
}

export default function AccountScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session, sendEmailAuth, startProvider } = useAuth();
  const { language, t } = useI18n();
  const { isEnabled, isVisible } = useRuntimeConfig();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [installations, setInstallations] = useState<AccountInstallation[]>([]);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const userId = session?.user.id;
  const showUsage = isVisible('account.usage');
  const enableUsage = isEnabled('account.usage');

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    // Bind on every platform, including web: account security flows require an
    // active installation_sessions row.
    await bindCurrentInstallation(userId).catch(() => undefined);
    const [summaryResult, identityResult, installationResult, capabilityResult] = await Promise.allSettled([
      getAccountSummary(),
      supabase.auth.getUserIdentities(),
      Platform.OS === 'web' ? Promise.resolve([]) : listAccountInstallations(),
      getAuthCapabilities(),
    ]);
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    if (identityResult.status === 'fulfilled' && !identityResult.value.error) {
      setIdentities(identityResult.value.data?.identities ?? []);
    }
    if (installationResult.status === 'fulfilled') setInstallations(installationResult.value);
    if (capabilityResult.status === 'fulfilled') setCapabilities(capabilityResult.value);
    const failure = [summaryResult, identityResult, installationResult].find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      setLoadError(failure.reason instanceof Error ? failure.reason.message : t('account.loadError'));
    }
    setLoading(false);
  }, [t, userId]);

  const refreshUsage = useCallback(async () => {
    if (!userId || !showUsage || !enableUsage) {
      setUsageLoading(false);
      return;
    }
    setUsageLoading(true);
    setUsageError(null);
    try {
      setUsage(await getAccountUsage());
    } catch {
      setUsageError(t('account.usageLoadError'));
    } finally {
      setUsageLoading(false);
    }
  }, [enableUsage, showUsage, t, userId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    void refreshUsage();
  }, [refresh, refreshUsage]));

  const isAnonymous = summary?.isAnonymous ?? session?.user.is_anonymous ?? true;
  const linkedProviders = useMemo(() => new Set(identities.map((identity) => identity.provider)), [identities]);

  if (!session) return <Redirect href="/sign-in" />;

  async function addEmail() {
    if (!email.trim() || busy) return;
    setBusy('email');
    try {
      const transaction = await sendEmailAuth(email, isAnonymous ? 'protect_guest' : 'link_method');
      router.push({
        pathname: '/auth/check-email' as never,
        params: { email: transaction.email ?? email, intent: transaction.intent, transaction: transaction.id },
      });
    } catch (error) {
      Alert.alert(t('account.linkError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(null);
    }
  }

  async function linkProvider(provider: AuthProviderName) {
    if (busy) return;
    setBusy(provider);
    try {
      const result = await startProvider(provider, isAnonymous ? 'protect_guest' : 'link_method');
      if (result) await refresh();
    } catch (error) {
      Alert.alert(t('account.linkError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(null);
    }
  }

  function confirmUnlink(identity: UserIdentity) {
    if (identities.length <= 1) {
      Alert.alert(t('account.keepOneMethod'), t('account.keepOneMethodBody'));
      return;
    }
    Alert.alert(
      t('account.unlinkTitle', { provider: providerNames[identity.provider] ?? identity.provider }),
      t('account.unlinkBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('account.unlink'), style: 'destructive', onPress: () => void unlink(identity) },
      ],
    );
  }

  async function unlink(identity: UserIdentity) {
    setBusy(identity.id);
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      await refresh();
    } catch (error) {
      Alert.alert(t('account.unlinkError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(null);
    }
  }

  function confirmRevoke(installation: AccountInstallation) {
    Alert.alert(t('account.removeDeviceTitle'), t('account.removeDeviceBody', { name: installation.displayName ?? installation.platform }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.removeDevice'), style: 'destructive', onPress: () => void revokeInstallation(installation.id) },
    ]);
  }

  async function revokeInstallation(id: string) {
    setBusy(id);
    try {
      await revokeAccountInstallation(id);
      await refresh();
    } catch (error) {
      Alert.alert(t('account.removeDeviceError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(null);
    }
  }

  function confirmSignOut(scope: 'current' | 'others' | 'all') {
    const guestCurrent = isAnonymous && scope === 'current';
    Alert.alert(guestCurrent ? t('settings.signOutPermanent') : t(`account.signOut.${scope}Title`), guestCurrent ? t('settings.signOutPermanentBody') : t(`account.signOut.${scope}Body`), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: scope === 'others' ? 'default' : 'destructive', onPress: () => void signOut(scope) },
    ]);
  }

  async function signOut(scope: 'current' | 'others' | 'all') {
    if (!userId || busy) return;
    setBusy(`sign-out-${scope}`);
    try {
      if (scope === 'others') {
        await revokeOtherAccountInstallations();
        const { error } = await supabase.auth.signOut({ scope: 'others' });
        if (error) throw error;
        await refresh();
        Alert.alert(t('account.otherSessionsRevoked'));
        return;
      }
      if (scope === 'all') await revokeOtherAccountInstallations();
      // Fail closed: if push unregister fails, keep the session so the user is
      // not left signed out while the installation still receives pushes.
      await unregisterThisInstallation(userId);
      const { error } = await supabase.auth.signOut({ scope: scope === 'all' ? 'global' : 'local' });
      if (error) throw error;
      await clearPrivateUserState(userId).catch(() => undefined);
      router.replace('/sign-in');
    } catch (error) {
      Alert.alert(t('settings.signOutError'), error instanceof Error ? error.message : t('auth.connectionError'));
    } finally {
      setBusy(null);
    }
  }

  const providerButtons: { name: AuthProviderName; enabled: boolean }[] = [
    { name: 'apple', enabled: Platform.OS === 'ios' && capabilities?.apple === true },
    { name: 'google', enabled: capabilities?.google === true },
    { name: 'github', enabled: capabilities?.github === true },
  ];

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><AppIcon color={colors.primary} fallback="•" name="person.crop.circle.fill" size={35} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{isAnonymous ? t('account.guestTitle') : summary?.recoveryEmail ?? t('account.protectedTitle')}</Text>
            <Text style={styles.heroBody}>{isAnonymous ? t('account.guestBody') : t('account.protectedBody')}</Text>
          </View>
          {summary?.isProtected ? <View style={styles.protectedBadge}><Text style={styles.protectedText}>{t('account.protected')}</Text></View> : null}
        </View>

        {loadError ? <View style={styles.errorBox}><Text style={styles.errorText}>{loadError}</Text><Pressable onPress={() => void refresh()}><Text style={styles.retry}>{t('common.retry')}</Text></Pressable></View> : null}

        {showUsage ? <>
        <Text style={styles.section}>{t('account.usage')}</Text>
        <View style={[styles.card, !enableUsage && styles.disabled]}>
          {!enableUsage ? <View style={styles.usageLoading}><Text style={styles.usageLoadingText}>{t('common.unavailable')}</Text></View> :
          usageLoading && !usage ? (
            <View accessibilityLabel={t('account.usageLoading')} style={styles.usageLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.usageLoadingText}>{t('account.usageLoading')}</Text>
            </View>
          ) : usage ? (
            <>
              <View style={styles.usageRecentRow}>
                <UsageMetric emphasized label={t('account.usageLast24Hours')} value={formatUsageCount(usage.alertsLast24Hours, language)} />
                <UsageMetric emphasized label={t('account.usageLast7Days')} value={formatUsageCount(usage.alertsLast7Days, language)} />
              </View>
              <View style={styles.divider} />
              <View style={styles.usageGrid}>
                <UsageMetric label={t('account.usageSources')} value={formatUsageValue(usage.sources, usage.limits.maxSourceKeys, language, t)} />
                <UsageMetric label={t('account.usageActiveKeys')} value={formatUsageCount(usage.activeKeys, language)} />
                <UsageMetric label={t('account.usagePhones')} value={formatUsageValue(usage.phones, usage.limits.maxPushDevices, language, t)} />
                <UsageMetric label={t('account.usageRetainedAlerts')} value={formatUsageCount(usage.retainedAlerts, language)} />
                <UsageMetric label={t('account.usageAttachments')} value={formatUsageCount(usage.attachments, language)} />
                <UsageMetric label={t('account.usageAttachmentStorage')} value={formatAccountUsageBytes(usage.attachmentBytes)} />
              </View>
              {usageError ? <UsageRetry error={usageError} loading={usageLoading} onRetry={refreshUsage} /> : null}
            </>
          ) : (
            <UsageRetry error={usageError ?? t('account.usageLoadError')} loading={usageLoading} onRetry={refreshUsage} />
          )}
        </View>
        </> : null}

        <Text style={styles.section}>{t('account.signInMethods')}</Text>
        <View style={styles.card}>
          {identities.length ? identities.map((identity, index) => (
            <View key={identity.id}>
              {index ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.methodIcon}><Text style={styles.methodInitial}>{(providerNames[identity.provider] ?? identity.provider).slice(0, 1)}</Text></View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{providerNames[identity.provider] ?? identity.provider}</Text>
                  <Text numberOfLines={1} style={styles.rowBody}>{identityHint(identity) ?? t('account.connected')}</Text>
                </View>
                <Pressable disabled={Boolean(busy)} onPress={() => confirmUnlink(identity)} style={styles.rowAction}>
                  {busy === identity.id ? <ActivityIndicator color={colors.muted} size="small" /> : <Text style={styles.rowActionText}>{t('account.unlink')}</Text>}
                </Pressable>
              </View>
            </View>
          )) : <Text style={styles.emptyText}>{t('account.noMethods')}</Text>}
        </View>

        {capabilities?.email === true && !linkedProviders.has('email') ? (
          <View style={styles.linkCard}>
            <Text style={styles.linkTitle}>{isAnonymous ? t('account.protectWithEmail') : t('account.addEmail')}</Text>
            <Text style={styles.linkBody}>{t('account.emailHelp')}</Text>
            <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!busy} keyboardType="email-address" onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={colors.mutedLight} style={styles.input} value={email} />
            <Pressable disabled={Boolean(busy) || !email.trim()} onPress={() => void addEmail()} style={[styles.primaryButton, (busy || !email.trim()) && styles.disabled]}>
              {busy === 'email' ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{t('account.sendCode')}</Text>}
            </Pressable>
          </View>
        ) : null}

        {providerButtons.some(({ enabled, name }) => enabled && !linkedProviders.has(name)) ? (
          <View style={styles.card}>
            {providerButtons.filter(({ enabled, name }) => enabled && !linkedProviders.has(name)).map(({ name }, index) => (
              <View key={name}>
                {index ? <View style={styles.divider} /> : null}
                <Pressable disabled={Boolean(busy)} onPress={() => void linkProvider(name)} style={styles.linkProviderRow}>
                  <Text style={styles.rowTitle}>{t('account.addProvider', { provider: providerNames[name] })}</Text>
                  {busy === name ? <ActivityIndicator color={colors.primary} size="small" /> : <AppIcon color={colors.primary} fallback="+" name="plus" size={19} />}
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.section}>{t('account.installations')}</Text>
        <View style={styles.card}>
          {loading && !installations.length ? <ActivityIndicator color={colors.primary} /> : installations.length ? installations.map((installation, index) => (
            <View key={installation.id}>
              {index ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.deviceIcon}><AppIcon color={colors.primary} fallback="□" name="iphone" size={21} /></View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{installation.displayName ?? t('account.deviceName', { platform: installation.platform })}{installation.isCurrent ? ` · ${t('account.thisDevice')}` : ''}</Text>
                  <Text style={styles.rowBody}>{installation.lastSeenAt ? t('account.lastSeen', { time: relativeTime(installation.lastSeenAt) }) : t('account.neverSeen')}</Text>
                </View>
                {!installation.isCurrent && !installation.revokedAt ? <Pressable disabled={Boolean(busy)} onPress={() => confirmRevoke(installation)} style={styles.rowAction}>
                  {busy === installation.id ? <ActivityIndicator color={colors.danger} size="small" /> : <Text style={styles.dangerActionText}>{t('account.remove')}</Text>}
                </Pressable> : installation.revokedAt ? <Text style={styles.revoked}>{t('account.revoked')}</Text> : null}
              </View>
            </View>
          )) : <Text style={styles.emptyText}>{Platform.OS === 'web' ? t('account.mobileOnly') : t('account.noInstallations')}</Text>}
        </View>

        <Text style={styles.section}>{t('account.sessions')}</Text>
        <View style={styles.card}>
          <AccountAction label={t('account.signOut.current')} onPress={() => confirmSignOut('current')} />
          {!isAnonymous ? <><View style={styles.divider} /><AccountAction label={t('account.signOut.others')} onPress={() => confirmSignOut('others')} /></> : null}
          {!isAnonymous ? <><View style={styles.divider} /><AccountAction danger label={t('account.signOut.all')} onPress={() => confirmSignOut('all')} /></> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatUsageCount(value: number, language: string) {
  try {
    return value.toLocaleString(language);
  } catch {
    return String(value);
  }
}

function formatUsageValue(
  value: number,
  limit: number | null,
  language: string,
  t: ReturnType<typeof useI18n>['t'],
) {
  const count = formatUsageCount(value, language);
  return limit === null
    ? count
    : t('account.usageOfLimit', { count, limit: formatUsageCount(limit, language) });
}

function UsageMetric({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.usageMetric, emphasized && styles.usageMetricEmphasized]}>
      <Text style={[styles.usageValue, emphasized && styles.usageValueEmphasized]}>{value}</Text>
      <Text style={styles.usageLabel}>{label}</Text>
    </View>
  );
}

function UsageRetry({ error, loading, onRetry }: { error: string; loading: boolean; onRetry: () => Promise<void> }) {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  return (
    <View style={styles.usageError}>
      <Text style={styles.usageErrorText}>{error}</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => void onRetry()} style={styles.usageRetry}>
        {loading ? <ActivityIndicator color={colors.danger} size="small" /> : <Text style={styles.retry}>{t('common.retry')}</Text>}
      </Pressable>
    </View>
  );
}

function AccountAction({ danger = false, label, onPress }: { danger?: boolean; label: string; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionRow}><Text style={[styles.actionText, danger && styles.dangerText]}>{label}</Text><AppIcon color={danger ? colors.danger : colors.primary} fallback="›" name="chevron.right" size={17} /></Pressable>;
}

const createStyles = () => StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  page: { alignSelf: 'center', maxWidth: 680, padding: 18, paddingBottom: 42, width: '100%' },
  hero: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.large, flexDirection: 'row', padding: 18 },
  heroIcon: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 25, height: 50, justifyContent: 'center', width: 50 },
  heroCopy: { flex: 1, marginLeft: 12 },
  heroTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  heroBody: { color: '#D8EAE4', fontSize: 12, lineHeight: 17, marginTop: 3 },
  protectedBadge: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.full, marginLeft: 8, paddingHorizontal: 9, paddingVertical: 5 },
  protectedText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  section: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, marginBottom: 7, marginLeft: 4, marginTop: 20 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 5 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 66, paddingVertical: 9 },
  rowCopy: { flex: 1, marginLeft: 11 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowBody: { color: colors.muted, fontSize: 11, marginTop: 3 },
  methodIcon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 16, height: 34, justifyContent: 'center', width: 34 },
  methodInitial: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  deviceIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 16, height: 36, justifyContent: 'center', width: 36 },
  rowAction: { borderRadius: radius.small, paddingHorizontal: 8, paddingVertical: 7 },
  rowActionText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  dangerActionText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  revoked: { color: colors.mutedLight, fontSize: 11, fontWeight: '700' },
  divider: { backgroundColor: colors.border, height: 1 },
  emptyText: { color: colors.muted, fontSize: 13, paddingVertical: 17, textAlign: 'center' },
  linkCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, marginTop: 9, padding: 15 },
  linkTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  linkBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.small, borderWidth: 1, color: colors.text, fontSize: 14, marginTop: 12, minHeight: 46, paddingHorizontal: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.small, justifyContent: 'center', marginTop: 9, minHeight: 45, padding: 11 },
  primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  linkProviderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, paddingVertical: 8 },
  actionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingVertical: 8 },
  actionText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  dangerText: { color: colors.danger },
  errorBox: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 10, marginTop: 12, padding: 12 },
  errorText: { color: colors.danger, flex: 1, fontSize: 11 },
  retry: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  usageLoading: { alignItems: 'center', flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 92 },
  usageLoadingText: { color: colors.muted, fontSize: 12 },
  usageRecentRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  usageGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 7, paddingTop: 5 },
  usageMetric: { flexBasis: '48%', minHeight: 64, paddingHorizontal: 5, paddingVertical: 9 },
  usageMetricEmphasized: { backgroundColor: colors.primarySoft, borderRadius: radius.small, flex: 1, minHeight: 76, paddingHorizontal: 12 },
  usageValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  usageValueEmphasized: { color: colors.primary, fontSize: 23 },
  usageLabel: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  usageError: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 58, paddingVertical: 8 },
  usageErrorText: { color: colors.danger, flex: 1, fontSize: 11, lineHeight: 16 },
  usageRetry: { alignItems: 'center', minWidth: 48, paddingHorizontal: 6, paddingVertical: 8 },
});
