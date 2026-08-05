import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { ErrorState } from '@/components/ErrorState';
import { ImageLightbox } from '@/components/ImageLightbox';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useBottomSafePadding } from '@/components/TabScreen';
import { deleteNotification, getNotification, getNotificationDeliverySummary, markNotificationRead, setNotificationPinned } from '@/data/notifications';
import { deliveryStatusVisible } from '@/lib/app-version';
import { userMessage } from '@/lib/errors';
import { relativeTime, sourceInitial } from '@/lib/format';
import { severityAppearance } from '@/lib/notification-severity';
import { notificationActionText } from '@/lib/notification-actions';
import { runtimeNumber } from '@/lib/runtime-controls';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';
import { getLocaleTag } from '@/i18n';
import { colors, radius, shadows } from '@/theme';
import { useThemedStyles } from '@/theme-preference';
import type { InboxNotification } from '@/types';
import type { NotificationDeliveryState, NotificationDeliverySummary } from '@/lib/notification-delivery';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NotificationDetailScreen() {
  const styles = useThemedStyles(createStyles);
  const { session, loading: authLoading } = useAuth();
  const { language, t } = useI18n();
  const { snapshot, isEnabled, isVisible } = useRuntimeConfig();
  const { id: idParameter } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const bottomPadding = useBottomSafePadding(24);
  const candidateId = Array.isArray(idParameter) ? idParameter[0] : idParameter;
  const id = candidateId && uuidPattern.test(candidateId) ? candidateId : null;
  const userId = session?.user.id;
  const generation = useRef(0);
  const deliveryGeneration = useRef(0);
  const deliveryFirstPollAt = useRef<number | null>(null);
  const [item, setItem] = useState<InboxNotification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delivery, setDelivery] = useState<NotificationDeliverySummary | null>(null);
  const [deliveryError, setDeliveryError] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [attachment, setAttachment] = useState<{ path: string; url: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliveryVisible = deliveryStatusVisible()
    && isVisible('notification.delivery_status')
    && isEnabled('notification.delivery_status');
  const deliveryPollMilliseconds = runtimeNumber(snapshot, 'notification.delivery_poll_seconds', 15, 5, 300) * 1_000;
  const attachmentUrlTtlSeconds = runtimeNumber(snapshot, 'notification.attachment_url_ttl_seconds', 3600, 60, 86400);

  // Reset detail state when navigating to a different notification id.
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setItem(null);
    setError(null);
    setReadError(null);
    setDelivery(null);
    setDeliveryError(false);
    setDeliveryLoading(true);
    setLoading(true);
  }

  useEffect(() => {
    deliveryFirstPollAt.current = null;
  }, [id]);

  const loadDelivery = useCallback(async (notificationId: string, showSpinner = false) => {
    const request = ++deliveryGeneration.current;
    if (showSpinner) setDeliveryLoading(true);
    setDeliveryError(false);
    try {
      const summary = await getNotificationDeliverySummary(notificationId);
      if (request === deliveryGeneration.current) setDelivery(summary);
    } catch {
      if (request === deliveryGeneration.current) setDeliveryError(true);
    } finally {
      if (request === deliveryGeneration.current) setDeliveryLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    const request = ++generation.current;
    try {
      const notification = await getNotification(id);
      if (request !== generation.current) return;
      setItem(notification);
      setLoading(false);
      if (notification && deliveryVisible) void loadDelivery(notification.id);
      else setDeliveryLoading(false);

      if (notification && !notification.read_at) {
        const readAt = new Date().toISOString();
        setMarkingRead(true);
        try {
          await markNotificationRead(notification.id, readAt);
          if (request !== generation.current) return;
          setItem((current) => current?.id === notification.id ? { ...current, read_at: readAt } : current);
        } catch (caught) {
          if (request === generation.current) {
            setReadError(caught instanceof Error ? caught : new Error(t('notification.readError')));
          }
        } finally {
          if (request === generation.current) setMarkingRead(false);
        }
      }
    } catch (caught) {
      if (request === generation.current) {
        setItem(null);
        setError(caught instanceof Error ? caught : new Error(t('error.default')));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [deliveryVisible, id, loadDelivery, t, userId]);

  useEffect(() => {
    if (!userId || !id) return;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
      deliveryGeneration.current += 1;
    };
  }, [id, load, userId]);

  useEffect(() => {
    if (!deliveryVisible || !id || delivery?.state !== 'queued') return;
    deliveryFirstPollAt.current = Date.now();
    const timer = setInterval(() => {
      if (deliveryFirstPollAt.current && Date.now() - deliveryFirstPollAt.current > 120_000) {
        clearInterval(timer);
        return;
      }
      void loadDelivery(id);
    }, deliveryPollMilliseconds);
    return () => clearInterval(timer);
  }, [delivery?.state, deliveryPollMilliseconds, deliveryVisible, id, loadDelivery]);

  useEffect(() => {
    const path = item?.attachment_path;
    if (!path || !isVisible('notification.attachments') || !isEnabled('notification.attachments')) return;
    let active = true;
    supabase.storage
      .from('notification-attachments')
      .createSignedUrl(path, attachmentUrlTtlSeconds)
      .then(({ data, error }) => {
        if (!active) return;
        setAttachment({ path, url: error ? null : data.signedUrl });
      })
      .catch(() => {
        if (active) setAttachment({ path, url: null });
      });
    return () => {
      active = false;
    };
  }, [attachmentUrlTtlSeconds, isEnabled, isVisible, item?.attachment_path]);

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
  }, []);

  const attachmentPath = item?.attachment_path ?? null;
  const attachmentReady = Boolean(attachmentPath) && attachment?.path === attachmentPath;
  const attachmentLoading = Boolean(attachmentPath) && !attachmentReady;
  const attachmentUrl = attachmentReady ? (attachment?.url ?? null) : null;

  async function retryMarkRead() {
    if (!item || item.read_at || markingRead) return;
    const notificationId = item.id;
    const readAt = new Date().toISOString();
    setMarkingRead(true);
    setReadError(null);
    try {
      await markNotificationRead(notificationId, readAt);
      setItem((current) => current?.id === notificationId ? { ...current, read_at: readAt } : current);
    } catch (caught) {
      setReadError(caught instanceof Error ? caught : new Error(t('notification.readError')));
    } finally {
      setMarkingRead(false);
    }
  }

  function goToInbox() {
    router.replace('/(tabs)');
  }

  async function performDelete(notificationId: string) {
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      await deleteNotification(notificationId, item?.attachment_path ?? null);
      if (router.canGoBack()) router.back();
      else goToInbox();
    } catch (caught) {
      Alert.alert(t('notification.deleteError'), userMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  function remove() {
    if (!item || confirmingDelete || deleting) return;
    const notificationId = item.id;
    setConfirmingDelete(true);
    Alert.alert(
      t('notification.deleteTitle'),
      t('notification.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => setConfirmingDelete(false) },
        { text: t('notification.delete'), style: 'destructive', onPress: () => void performDelete(notificationId) },
      ],
      { cancelable: true, onDismiss: () => setConfirmingDelete(false) },
    );
  }

  async function copyNotification() {
    if (!item) return;
    try {
      await Clipboard.setStringAsync(notificationActionText(item, getLocaleTag(language)));
      setCopied(true);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopied(false), 2_000);
    } catch (caught) {
      Alert.alert(t('notification.copyError'), userMessage(caught));
    }
  }

  async function shareNotification() {
    if (!item) return;
    try {
      await Share.share({
        message: notificationActionText(item, getLocaleTag(language)),
        title: item.title,
      });
    } catch (caught) {
      Alert.alert(t('notification.shareError'), userMessage(caught));
    }
  }

  async function togglePinned() {
    if (!item || savingState) return;
    const next = !item.pinned_at;
    setSavingState(true);
    try {
      await setNotificationPinned(item.id, next);
      setItem((current) => current ? {
        ...current,
        pinned_at: next ? new Date().toISOString() : null,
      } : current);
    } catch (caught) {
      Alert.alert(t('notification.pinError'), userMessage(caught));
    } finally {
      setSavingState(false);
    }
  }

  async function markUnread() {
    if (!item || !item.read_at || savingState) return;
    setSavingState(true);
    try {
      await markNotificationRead(item.id, null);
      setItem((current) => current ? { ...current, read_at: null } : current);
    } catch (caught) {
      Alert.alert(t('notification.unreadError'), userMessage(caught));
    } finally {
      setSavingState(false);
    }
  }

  if (authLoading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!id) {
    return (
      <UnavailableState
        message={t('notification.invalidLink')}
        onPress={goToInbox}
      />
    );
  }
  if (loading) return <LoadingScreen />;
  if (error) {
    return (
      <View style={styles.center}>
        <ErrorState error={error} onRetry={() => {
          setError(null);
          setReadError(null);
          setLoading(true);
          void load();
        }} />
      </View>
    );
  }
  if (!item) {
    return (
      <UnavailableState
        message={t('notification.missing')}
        onPress={goToInbox}
      />
    );
  }

  const deleteBusy = confirmingDelete || deleting;
  const showSeverity = isVisible('notification.severity') && isEnabled('notification.severity');
  const severity = severityAppearance(showSeverity ? item.severity : null);
  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottomPadding }]}>
      <View style={styles.sourceRow}>
        <View style={[styles.avatar, { backgroundColor: severity.background, borderColor: severity.border }]}>
          <Text style={styles.avatarText}>{sourceInitial(item.source_name_snapshot)}</Text>
          <View style={styles.bellBadge}>
            <AppIcon color={severity.icon} fallback="!" name="bell.fill" size={12} />
          </View>
        </View>
        <View style={styles.sourceCopy}>
          <Text numberOfLines={1} style={styles.source}>{item.source_name_snapshot}</Text>
          <Text style={styles.time}>
            {isVisible('notification.absolute_time') && isEnabled('notification.absolute_time')
              ? `${new Date(item.created_at).toLocaleString(getLocaleTag(language))} · ${relativeTime(item.created_at)}`
              : relativeTime(item.created_at)}
          </Text>
        </View>
      </View>
      {item.category && isVisible('notification.category') && isEnabled('notification.category') ? <Text style={styles.category}>{item.category.toUpperCase()}</Text> : null}
      <View style={styles.messageCard}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
      </View>

      {deliveryVisible ? <DeliveryCard
          error={deliveryError}
          loading={deliveryLoading}
          onRetry={() => {
            deliveryFirstPollAt.current = Date.now();
            void loadDelivery(item.id, true);
          }}
          summary={delivery}
        /> : null}

      {item.attachment_path && isVisible('notification.attachments') && isEnabled('notification.attachments') ? (
        <>
          <Text style={styles.attachmentLabel}>{t('notification.attachment')}</Text>
          <View style={styles.attachmentCard}>
            {attachmentLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {!attachmentLoading && attachmentUrl ? (
              <ImageLightbox
                accessibilityLabel={t('notification.attachmentA11y')}
                previewStyle={styles.attachment}
                uri={attachmentUrl}
              />
            ) : null}
            {!attachmentLoading && !attachmentUrl ? (
              <Text style={styles.attachmentError}>
                {t('notification.attachmentLoadError')}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {readError ? (
        <View accessibilityLiveRegion="polite" style={styles.readError}>
          <View style={styles.readErrorCopy}>
            <Text style={styles.readErrorTitle}>{t('notification.readError')}</Text>
            <Text style={styles.readErrorMessage}>{userMessage(readError)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: markingRead }}
            disabled={markingRead}
            onPress={() => void retryMarkRead()}
            style={({ pressed }) => [styles.retryRead, pressed && styles.pressed]}
          >
            {markingRead
              ? <ActivityIndicator color={colors.danger} size="small" />
              : <Text style={styles.retryReadText}>{t('common.retry')}</Text>}
          </Pressable>
        </View>
      ) : null}

      {Object.keys(item.data ?? {}).length && isVisible('notification.metadata') && isEnabled('notification.metadata') ? (
        <>
          <Text style={styles.metadataLabel}>{t('notification.metadata')}</Text>
          <View style={styles.codeBox}><Text selectable style={styles.code}>{JSON.stringify(item.data, null, 2)}</Text></View>
        </>
      ) : null}
      {isVisible('notification.pin') || isVisible('notification.mark_unread') || isVisible('notification.copy') || isVisible('notification.share') ? (
        <View style={styles.quickActions}>
          {isVisible('notification.pin') ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: savingState || !isEnabled('notification.pin'), selected: Boolean(item.pinned_at) }}
              disabled={savingState || !isEnabled('notification.pin')}
              onPress={() => void togglePinned()}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed, (savingState || !isEnabled('notification.pin')) && styles.disabled]}
            >
              <AppIcon color={colors.primary} fallback="P" name={item.pinned_at ? 'pin.slash.fill' : 'pin.fill'} size={16} />
              <Text numberOfLines={1} style={styles.quickActionText}>{item.pinned_at ? t('notification.unpin') : t('notification.pin')}</Text>
            </Pressable>
          ) : null}
          {isVisible('notification.mark_unread') && item.read_at ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: savingState || !isEnabled('notification.mark_unread') }}
              disabled={savingState || !isEnabled('notification.mark_unread')}
              onPress={() => void markUnread()}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed, (savingState || !isEnabled('notification.mark_unread')) && styles.disabled]}
            >
              <AppIcon color={colors.primary} fallback="U" name="envelope.badge" size={16} />
              <Text numberOfLines={1} style={styles.quickActionText}>{t('notification.markUnread')}</Text>
            </Pressable>
          ) : null}
          {isVisible('notification.copy') ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !isEnabled('notification.copy') }}
              disabled={!isEnabled('notification.copy')}
              onPress={() => void copyNotification()}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed, !isEnabled('notification.copy') && styles.disabled]}
            >
              <AppIcon color={colors.primary} fallback="C" name={copied ? 'checkmark' : 'doc.on.doc'} size={16} />
              <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.quickActionText}>
                {copied ? t('notification.copied') : t('notification.copy')}
              </Text>
            </Pressable>
          ) : null}
          {isVisible('notification.share') ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !isEnabled('notification.share') }}
              disabled={!isEnabled('notification.share')}
              onPress={() => void shareNotification()}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed, !isEnabled('notification.share') && styles.disabled]}
            >
              <AppIcon color={colors.primary} fallback="S" name="square.and.arrow.up" size={16} />
              <Text numberOfLines={1} style={styles.quickActionText}>{t('notification.share')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleteBusy }}
        disabled={deleteBusy}
        onPress={remove}
        style={({ pressed }) => [styles.delete, pressed && styles.pressed, deleteBusy && styles.disabled]}
      >
        {deleting
          ? <ActivityIndicator color={colors.danger} size="small" />
          : <AppIcon color={colors.danger} fallback="×" name="trash" size={15} />}
        <Text style={styles.deleteText}>{deleting ? t('notification.deleting') : t('notification.delete')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const deliveryIcons: Record<NotificationDeliveryState, SFSymbol> = {
  needs_attention: 'exclamationmark.triangle.fill',
  not_sent: 'bell.slash.fill',
  queued: 'clock.fill',
  sent: 'checkmark.circle.fill',
};

const deliveryTitleKeys = {
  needs_attention: 'notification.delivery.needsAttention.title',
  not_sent: 'notification.delivery.notSent.title',
  queued: 'notification.delivery.queued.title',
  sent: 'notification.delivery.sent.title',
} as const;

const deliveryBodyKeys = {
  needs_attention: 'notification.delivery.needsAttention.body',
  not_sent: 'notification.delivery.notSent.body',
  queued: 'notification.delivery.queued.body',
  sent: 'notification.delivery.sent.body',
} as const;

function deliveryBodyKey(summary: NotificationDeliverySummary) {
  switch (summary.reason) {
    case 'quiet_hours': return 'notification.delivery.reason.quietHours' as const;
    case 'device_unavailable': return 'notification.delivery.reason.deviceUnavailable' as const;
    case 'message_too_big': return 'notification.delivery.reason.messageTooBig' as const;
    case 'provider_unavailable': return 'notification.delivery.reason.providerUnavailable' as const;
    case 'push_configuration': return 'notification.delivery.reason.pushConfiguration' as const;
    case 'unconfirmed': return 'notification.delivery.reason.unconfirmed' as const;
    default: return deliveryBodyKeys[summary.state];
  }
}

function DeliveryCard({
  error,
  loading,
  onRetry,
  summary,
}: {
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  summary: NotificationDeliverySummary | null;
}) {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  if (!summary && !error) return null;

  if (error && !summary) {
    return (
      <View accessibilityLiveRegion="polite" style={[styles.deliveryCard, styles.deliveryCardDanger]}>
        <View style={[styles.deliveryIcon, styles.deliveryIconDanger]}>
          <AppIcon color={colors.danger} fallback="!" name="bell.slash.fill" size={18} />
        </View>
        <View style={styles.deliveryCopy}>
          <Text style={styles.deliveryLabel}>{t('notification.delivery.label')}</Text>
          <Text style={[styles.deliveryTitle, styles.deliveryTitleDanger]}>
            {t('notification.delivery.unavailable')}
          </Text>
        </View>
        <Pressable accessibilityRole="button" disabled={loading} onPress={onRetry} style={styles.deliveryRetry}>
          {loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.deliveryRetryText}>{t('common.retry')}</Text>}
        </Pressable>
      </View>
    );
  }

  if (!summary) return null;

  const state = summary.state;
  const danger = state === 'needs_attention';
  const muted = state === 'not_sent';
  const tint = danger ? colors.danger : muted ? colors.muted : colors.primary;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.deliveryCard, danger && styles.deliveryCardDanger]}>
      <View style={[styles.deliveryIcon, danger && styles.deliveryIconDanger]}>
        {loading
          ? <ActivityIndicator color={tint} size="small" />
          : <AppIcon color={tint} fallback="•" name={deliveryIcons[state]} size={18} />}
      </View>
      <View style={styles.deliveryCopy}>
        <Text style={styles.deliveryLabel}>{t('notification.delivery.label')}</Text>
        <Text style={[styles.deliveryTitle, danger && styles.deliveryTitleDanger]}>
          {t(deliveryTitleKeys[state])}
        </Text>
        <Text style={styles.deliveryBody}>
          {t(deliveryBodyKey(summary), { accepted: summary.providerAccepted, count: summary.targetedPhones })}
        </Text>
        {summary.targetedPhones > 1 ? (
          <Text style={styles.deliveryMeta}>
            {t('notification.delivery.summary', {
              accepted: summary.providerAccepted,
              count: summary.targetedPhones,
              failed: summary.failed,
              pending: summary.pending,
            })}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Pressable accessibilityRole="button" disabled={loading} onPress={onRetry} style={styles.deliveryRetry}>
          {loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.deliveryRetryText}>{t('common.retry')}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

function UnavailableState({ message, onPress }: { message: string; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.missing}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.inboxButton, pressed && styles.pressed]}
      >
        <Text style={styles.inboxButtonText}>{t('notification.returnInbox')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 22 },
  center: { alignItems: 'stretch', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 30 },
  missing: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  inboxButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, justifyContent: 'center', marginTop: 18, minHeight: 44, paddingHorizontal: 18 },
  inboxButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  sourceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 23 },
  avatar: { alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 50, justifyContent: 'center', position: 'relative', width: 50 },
  avatarText: { color: colors.primary, fontSize: 19, fontWeight: '800' },
  bellBadge: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 10, bottom: -4, height: 20, justifyContent: 'center', position: 'absolute', right: -4, width: 20 },
  sourceCopy: { flex: 1 },
  source: { color: colors.text, fontSize: 16, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 11, marginTop: 3 },
  category: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  messageCard: { ...shadows.card, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, padding: 19 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, lineHeight: 30, marginBottom: 13 },
  body: { color: colors.textSoft, fontSize: 16, lineHeight: 25 },
  deliveryCard: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 14, padding: 13 },
  deliveryCardDanger: { backgroundColor: colors.dangerSoft, borderColor: '#EECFCD' },
  deliveryIcon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  deliveryIconDanger: { backgroundColor: '#FFF8F7' },
  deliveryCopy: { flex: 1 },
  deliveryLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  deliveryTitle: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 2 },
  deliveryTitleDanger: { color: colors.danger },
  deliveryBody: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 3 },
  deliveryMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  deliveryRetry: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.small, justifyContent: 'center', minHeight: 42, minWidth: 58, paddingHorizontal: 10 },
  deliveryRetryText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  readError: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderColor: '#EECFCD', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 16, padding: 12 },
  readErrorCopy: { flex: 1 },
  readErrorTitle: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  readErrorMessage: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 2 },
  retryRead: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.small, justifyContent: 'center', minHeight: 44, minWidth: 64, paddingHorizontal: 12 },
  retryReadText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  metadataLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 7, marginTop: 30 },
  attachmentLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 7, marginTop: 18 },
  attachmentCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, justifyContent: 'center', minHeight: 120, overflow: 'hidden', padding: 8 },
  attachment: { alignSelf: 'center', height: 320, width: '100%' },
  attachmentError: { color: colors.muted, fontSize: 12, padding: 20, textAlign: 'center' },
  codeBox: { backgroundColor: colors.text, borderRadius: radius.medium, padding: 14 },
  code: { color: '#E7ECE9', fontSize: 11, lineHeight: 17 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  quickAction: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexBasis: '46%', flexGrow: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  quickActionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  delete: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 28, minHeight: 52, padding: 14 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.55 },
});
