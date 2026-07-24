import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { ErrorState } from '@/components/ErrorState';
import { ImageLightbox } from '@/components/ImageLightbox';
import { LoadingScreen } from '@/components/LoadingScreen';
import { deleteNotification, getNotification, markNotificationRead } from '@/data/notifications';
import { userMessage } from '@/lib/errors';
import { relativeTime, sourceInitial } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { getLocaleTag } from '@/i18n';
import { colors, radius, shadows } from '@/theme';
import type { InboxNotification } from '@/types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NotificationDetailScreen() {
  const { session, loading: authLoading } = useAuth();
  const { language, t } = useI18n();
  const { id: idParameter } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const candidateId = Array.isArray(idParameter) ? idParameter[0] : idParameter;
  const id = candidateId && uuidPattern.test(candidateId) ? candidateId : null;
  const userId = session?.user.id;
  const generation = useRef(0);
  const [item, setItem] = useState<InboxNotification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attachment, setAttachment] = useState<{ path: string; url: string | null } | null>(null);

  // Reset detail state when navigating to a different notification id.
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setItem(null);
    setError(null);
    setReadError(null);
    setLoading(true);
  }

  const load = useCallback(async () => {
    if (!userId || !id) return;
    const request = ++generation.current;
    try {
      const notification = await getNotification(id);
      if (request !== generation.current) return;
      setItem(notification);
      setLoading(false);

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
  }, [id, t, userId]);

  useEffect(() => {
    if (!userId || !id) return;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [id, load, userId]);

  useEffect(() => {
    const path = item?.attachment_path;
    if (!path) return;
    let active = true;
    supabase.storage
      .from('notification-attachments')
      .createSignedUrl(path, 3600)
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
  }, [item?.attachment_path]);

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
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.sourceRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{sourceInitial(item.source_name_snapshot)}</Text></View>
        <View style={styles.sourceCopy}>
          <Text numberOfLines={1} style={styles.source}>{item.source_name_snapshot}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleString(getLocaleTag(language))} · {relativeTime(item.created_at)}</Text>
        </View>
      </View>
      {item.category ? <Text style={styles.category}>{item.category.toUpperCase()}</Text> : null}
      <View style={styles.messageCard}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
      </View>

      {item.attachment_path ? (
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

      {Object.keys(item.data ?? {}).length ? (
        <>
          <Text style={styles.metadataLabel}>{t('notification.metadata')}</Text>
          <View style={styles.codeBox}><Text selectable style={styles.code}>{JSON.stringify(item.data, null, 2)}</Text></View>
        </>
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

function UnavailableState({ message, onPress }: { message: string; onPress: () => void }) {
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

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 22 },
  center: { alignItems: 'stretch', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 30 },
  missing: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  inboxButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.full, justifyContent: 'center', marginTop: 18, minHeight: 44, paddingHorizontal: 18 },
  inboxButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  sourceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 23 },
  avatar: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 15, height: 50, justifyContent: 'center', width: 50 },
  avatarText: { color: colors.white, fontSize: 19, fontWeight: '800' },
  sourceCopy: { flex: 1 },
  source: { color: colors.text, fontSize: 16, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 11, marginTop: 3 },
  category: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginBottom: 10, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  messageCard: { ...shadows.card, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, padding: 19 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, lineHeight: 30, marginBottom: 13 },
  body: { color: colors.textSoft, fontSize: 16, lineHeight: 25 },
  readError: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderColor: '#EECFCD', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 16, padding: 12 },
  readErrorCopy: { flex: 1 },
  readErrorTitle: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  readErrorMessage: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 2 },
  retryRead: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.small, justifyContent: 'center', minHeight: 44, minWidth: 64, paddingHorizontal: 12 },
  retryReadText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  metadataLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 7, marginTop: 30 },
  attachmentLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 7, marginTop: 18 },
  attachmentCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, justifyContent: 'center', minHeight: 120, overflow: 'hidden', padding: 8 },
  attachment: { alignSelf: 'center', height: 320, width: '100%' },
  attachmentError: { color: colors.muted, fontSize: 12, padding: 20, textAlign: 'center' },
  codeBox: { backgroundColor: colors.text, borderRadius: radius.medium, padding: 14 },
  code: { color: '#E7ECE9', fontSize: 11, lineHeight: 17 },
  delete: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.medium, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 28, minHeight: 52, padding: 14 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.55 },
});
