import type { Database, Json, NotificationSound } from './types/database';

export type { NotificationSound };
export type ApiKey = Database['public']['Views']['source_access_keys']['Row'];
export type AppOptions = Database['public']['Views']['user_notification_preferences']['Row'];
export type Source = Database['public']['Views']['notification_sources']['Row'] & { api_key: ApiKey | null };

type NotificationRow = Database['public']['Views']['inbox_notifications']['Row'];
export type InboxNotification = Omit<NotificationRow, 'data' | 'idempotency_key' | 'request_hash'> & {
  data: Record<string, Json | undefined>;
};

export type CreatedSource = {
  sourceId: string;
  displayName: string;
  hostname: string | null;
  token: string;
  ingestUrl: string;
};

export type DeleteAccountCleanup = {
  apiKeys: number;
  appOptions: number;
  attachments: number;
  notifications: number;
  pushDevices: number;
  rateEvents: number;
  sourceCredentials: number;
  sources: number;
};

export type DeleteAccountResult = {
  cleanup: DeleteAccountCleanup;
  deleted: true;
  userId: string;
};
