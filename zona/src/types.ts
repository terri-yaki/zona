import type { Database, Json, NotificationSound } from './types/database';

export type { NotificationSound };
export type ApiKey = Database['public']['Views']['source_access_keys']['Row'];
export type AppOptions = Database['public']['Views']['user_notification_preferences']['Row'];
export type Source = Database['public']['Views']['notification_sources']['Row'] & { api_key: ApiKey | null };

type NotificationRow = Database['public']['Views']['inbox_notifications']['Row'];
export type InboxNotification = Omit<NotificationRow, 'data' | 'idempotency_key' | 'pinned_at' | 'push_suppressed_reason' | 'request_hash'> & {
  data: Record<string, Json | undefined>;
  pinned_at?: string | null;
  push_suppressed_reason?: 'quiet_hours' | null;
};

export type CreatedSource = {
  sourceId: string;
  accessKeyId: string;
  displayName: string;
  hostname: string | null;
  keyLabel: string;
  token: string;
  ingestUrl: string;
};

export type CreatedSourceAccessKey = {
  sourceId: string;
  accessKeyId: string;
  keyLabel: string;
  token: string;
  ingestUrl: string;
};

export type ManagedSourceAccessKey = {
  sourceId: string;
  accessKeyId: string;
  keyLabel: string;
  isActive: boolean;
  revokedAt: string | null;
};

export type SourceAccessKey = {
  id: string;
  source_id: string;
  name: string;
  key_prefix: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
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
