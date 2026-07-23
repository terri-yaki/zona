import { dataError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { InboxNotification } from '@/types';
import type { Json } from '@/types/database';

const notificationColumns = 'id,user_id,source_id,source_name_snapshot,title,body,category,data,created_at,read_at,expires_at,attachment_path,attachment_mime,attachment_bytes';
export const inboxPageSize = 50;

export type InboxCursor = { createdAt: string; id: string };
export type InboxFilters = {
  sourceId: string | null;
  since: string | null;
  unreadOnly: boolean;
};

function rowToNotification(row: {
  attachment_bytes: number | null;
  attachment_mime: string | null;
  attachment_path: string | null;
  body: string;
  category: string | null;
  created_at: string;
  data: Json;
  expires_at: string;
  id: string;
  read_at: string | null;
  source_id: string;
  source_name_snapshot: string;
  title: string;
  user_id: string;
}): InboxNotification {
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? row.data
    : {};
  return { ...row, data };
}

export async function listNotifications(filters: InboxFilters, cursor: InboxCursor | null = null) {
  let query = supabase
    .from('notifications')
    .select(notificationColumns)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(inboxPageSize + 1);

  if (filters.sourceId) query = query.eq('source_id', filters.sourceId);
  if (filters.unreadOnly) query = query.is('read_at', null);
  if (filters.since) query = query.gte('created_at', filters.since);
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  const { data, error } = await query;
  if (error) throw dataError(error, 'Your inbox could not be loaded.');
  const rows = data ?? [];
  const hasMore = rows.length > inboxPageSize;
  const items = rows.slice(0, inboxPageSize).map(rowToNotification);
  const last = items.at(-1);
  return {
    cursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
    hasMore,
    items,
  };
}

export async function unreadNotificationCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw dataError(error, 'The unread count could not be loaded.');
  return count ?? 0;
}

export async function getNotification(id: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select(notificationColumns)
    .eq('id', id)
    .maybeSingle();
  if (error) throw dataError(error, 'This notification could not be loaded.');
  return data ? rowToNotification(data) : null;
}

export async function markNotificationRead(id: string, readAt: string) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: readAt })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw dataError(error, 'The notification could not be marked as read.');
  if (!data) throw dataError(null, 'The notification is no longer available.');
}

export async function deleteNotification(id: string, attachmentPath: string | null = null) {
  // Remove the evidence image first: if row deletion then fails, the alert is
  // not stranded without its attachment; if image removal fails, nothing is lost.
  if (attachmentPath) {
    const { error: storageError } = await supabase.storage
      .from('notification-attachments')
      .remove([attachmentPath]);
    if (storageError) throw dataError(storageError, 'The attachment could not be deleted.');
  }
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw dataError(error, 'The notification could not be deleted.');
  if (!data) throw dataError(null, 'The notification is no longer available.');
}
