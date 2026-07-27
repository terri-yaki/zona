import type { Database, Json, NotificationSound } from './types/database';

export type { NotificationSound };
export type ApiKey = Database['public']['Tables']['api_keys']['Row'];
export type AppOptions = Database['public']['Tables']['app_options']['Row'];
export type UniversalAppOptions = Database['public']['Tables']['universal_app_options']['Row'];
export type Source = Database['public']['Tables']['sources']['Row'] & { api_key: ApiKey | null };

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type InboxNotification = Omit<NotificationRow, 'data'> & { data: Record<string, Json | undefined> };

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
