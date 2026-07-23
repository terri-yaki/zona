import type { Database, Json } from './types/database';

export type Source = Database['public']['Tables']['sources']['Row'];

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type InboxNotification = Omit<NotificationRow, 'data'> & { data: Record<string, Json | undefined> };

export type CreatedSource = {
  sourceId: string;
  displayName: string;
  hostname: string | null;
  token: string;
  ingestUrl: string;
};

export type DeleteAccountResult = { deleted: true };
