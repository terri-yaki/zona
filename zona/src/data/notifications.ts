import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { parseNotificationDeliverySummary } from '@/lib/notification-delivery';
import type { InboxNotification } from '@/types';
import type { Json } from '@/types/database';

const notificationColumns = 'id,user_id,source_id,source_name_snapshot,title,body,category,severity,data,created_at,read_at,expires_at,attachment_path,attachment_mime,attachment_bytes,pinned_at,push_suppressed_reason';
export const inboxPageSize = 30;

export type InboxCursor = { createdAt: string; id: string; pinned: boolean };
export type InboxFilters = {
  pinnedOnly?: boolean;
  searchQuery?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  sourceId: string | null;
  since: string | null;
  unreadOnly: boolean;
};

type NotificationPayload = {
  attachment_bytes: number | null;
  attachment_mime: string | null;
  attachment_path: string | null;
  body: string;
  category: string | null;
  created_at: string;
  data: Json;
  expires_at: string;
  id: string;
  pinned_at: string | null;
  push_suppressed_reason: 'quiet_hours' | null;
  read_at: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  source_id: string;
  source_name_snapshot: string;
  title: string;
  user_id: string;
};

function rowToNotification(row: NotificationPayload): InboxNotification {
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? row.data
    : {};
  return { ...row, data };
}

export async function listNotifications(
  filters: InboxFilters,
  cursor: InboxCursor | null = null,
  pageSize = inboxPageSize,
) {
  const v2 = await getInboxPageV2(filters, cursor, pageSize);
  if (v2) return v2;

  let query = supabase
    .from('inbox_notifications')
    .select(notificationColumns)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  if (filters.sourceId) query = query.eq('source_id', filters.sourceId);
  if (filters.unreadOnly) query = query.is('read_at', null);
  if (filters.since) query = query.gte('created_at', filters.since);
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  const { data, error } = await query;
  if (error) throw dataError(error, translate('error.loadTitle'));
  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(rowToNotification);
  const last = items.at(-1);
  return {
    cursor: hasMore && last ? { createdAt: last.created_at, id: last.id, pinned: Boolean(last.pinned_at) } : null,
    hasMore,
    items,
  };
}

function inboxV2Unavailable(error: { code?: string; message?: string }) {
  return error.code === '42883'
    || error.code === 'PGRST202'
    || /get_inbox_page_v2|schema cache/i.test(error.message ?? '');
}

async function getInboxPageV2(
  filters: InboxFilters,
  cursor: InboxCursor | null,
  pageSize: number,
) {
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data, error } = await rpc('get_inbox_page_v2', {
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_cursor_pinned: cursor?.pinned ?? null,
    p_page_size: pageSize,
    p_pinned_only: filters.pinnedOnly ?? false,
    p_search: (filters.searchQuery ?? '').trim() || null,
    p_severity: filters.severity ?? null,
    p_since: filters.since,
    p_source_id: filters.sourceId,
    p_unread_only: filters.unreadOnly,
  });
  if (error) {
    if (inboxV2Unavailable(error)
      && !filters.pinnedOnly
      && !(filters.searchQuery ?? '').trim()
      && !filters.severity) return null;
    throw dataError(error, translate('error.loadTitle'));
  }
  if (!isRecord(data) || !Array.isArray(data.rows)) {
    throw dataError(null, translate('error.loadTitle'));
  }
  const rows = data.rows as NotificationPayload[];
  const hasMore = data.hasMore === true || rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(rowToNotification);
  const last = items.at(-1);
  return {
    cursor: hasMore && last
      ? { createdAt: last.created_at, id: last.id, pinned: Boolean(last.pinned_at) }
      : null,
    hasMore,
    items,
    unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : undefined,
  };
}

export async function unreadNotificationCount() {
  const { count, error } = await supabase
    .from('inbox_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw dataError(error, translate('error.loadTitle'));
  return count ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotRpcUnavailable(error: { code?: string; message?: string }) {
  return error.code === '42883'
    || error.code === 'PGRST202'
    || /get_inbox_snapshot|schema cache/i.test(error.message ?? '');
}

function deliveryRpcUnavailable(error: { code?: string; message?: string }) {
  return error.code === '42883'
    || error.code === 'PGRST202'
    || /get_notification_delivery_summary|schema cache/i.test(error.message ?? '');
}

export async function getNotificationDeliverySummary(notificationId: string) {
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data, error } = await rpc('get_notification_delivery_summary', {
    p_notification_id: notificationId,
  });
  if (error) {
    // Keep a new binary compatible while the additive RPC reaches production.
    if (deliveryRpcUnavailable(error)) return null;
    throw dataError(error, translate('error.loadTitle'));
  }
  return parseNotificationDeliverySummary(data);
}

export async function getInboxSnapshot(
  filters: InboxFilters,
  pageSize = inboxPageSize,
) {
  const v2 = await getInboxPageV2(filters, null, pageSize);
  if (v2) {
    return { ...v2, unreadCount: v2.unreadCount ?? await unreadNotificationCount() };
  }
  const { data, error } = await supabase.rpc('get_inbox_snapshot', {
    p_page_size: pageSize,
    p_since: filters.since,
    p_source_id: filters.sourceId,
    p_unread_only: filters.unreadOnly,
  });

  if (error) {
    // Keep the app usable while the additive v0.0.7 migration rolls out.
    if (!snapshotRpcUnavailable(error)) throw dataError(error, translate('error.loadTitle'));
    const [page, unreadCount] = await Promise.all([
      listNotifications(filters, null, pageSize),
      unreadNotificationCount(),
    ]);
    return { ...page, unreadCount };
  }

  if (!isRecord(data) || !Array.isArray(data.rows) || typeof data.unreadCount !== 'number') {
    throw dataError(null, translate('error.loadTitle'));
  }
  const rows = data.rows as NotificationPayload[];
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(rowToNotification);
  const last = items.at(-1);
  return {
    cursor: hasMore && last ? { createdAt: last.created_at, id: last.id, pinned: Boolean(last.pinned_at) } : null,
    hasMore,
    items,
    unreadCount: data.unreadCount,
  };
}

export async function getNotification(id: string) {
  const { data, error } = await supabase
    .from('inbox_notifications')
    .select(notificationColumns)
    .eq('id', id)
    .maybeSingle();
  if (error) throw dataError(error, translate('error.loadTitle'));
  return data ? rowToNotification(data) : null;
}

export async function markNotificationRead(id: string, readAt: string | null) {
  const { data, error } = await supabase.rpc('mark_inbox_notification_read', {
    p_notification_id: id,
    p_read_at: readAt,
  } as never);
  if (error) throw dataError(error, translate('notification.readError'));
  if (data !== true) throw dataError(null, translate('notification.missing'));
}

export async function setNotificationPinned(id: string, pinned: boolean) {
  const { data, error } = await supabase.rpc('set_inbox_notification_pin' as never, {
    p_notification_id: id,
    p_pinned: pinned,
  } as never);
  if (error) throw dataError(error, translate('notification.pinError'));
  if (data !== true) throw dataError(null, translate('notification.missing'));
}

export async function markAllNotificationsRead(readAt = new Date().toISOString()) {
  const { error } = await supabase.rpc('mark_all_inbox_notifications_read', {
    p_read_at: readAt,
  });
  if (error) throw dataError(error, translate('inbox.markReadError'));
}

export async function deleteNotification(id: string, attachmentPath: string | null = null) {
  // Remove the evidence image first: if row deletion then fails, the alert is
  // not stranded without its attachment; if image removal fails, nothing is lost.
  if (attachmentPath) {
    const { error: storageError } = await supabase.storage
      .from('notification-attachments')
      .remove([attachmentPath]);
    if (storageError) throw dataError(storageError, translate('notification.deleteError'));
  }
  const { data, error } = await supabase.rpc('delete_inbox_notification', {
    p_notification_id: id,
  });
  if (error) throw dataError(error, translate('notification.deleteError'));
  if (data !== true) throw dataError(null, translate('notification.missing'));
}
