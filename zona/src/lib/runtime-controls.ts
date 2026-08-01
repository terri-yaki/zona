export const featureKeys = [
  'inbox.summary',
  'inbox.filters',
  'inbox.source_filter',
  'inbox.unread_filter',
  'inbox.time_filter',
  'inbox.mark_all_read',
  'inbox.show_revoked_filters',
  'inbox.pull_to_refresh',
  'inbox.pagination',
  'inbox.category_badges',
  'inbox.attachment_badges',
  'inbox.relative_time',
  'notification.attachments',
  'notification.category',
  'notification.metadata',
  'notification.severity',
  'notification.delivery_status',
  'notification.copy',
  'notification.share',
  'notification.absolute_time',
  'sources.create',
  'sources.search',
  'sources.pull_to_refresh',
  'sources.status_badges',
  'sources.hostname',
  'sources.last_seen',
  'sources.rename',
  'sources.pause',
  'sources.test',
  'sources.sound',
  'source_keys.create',
  'source_keys.rename',
  'source_keys.pull_to_refresh',
  'settings.account_summary',
  'settings.delivery_status',
  'settings.push',
  'settings.push_registration',
  'settings.sound',
  'settings.preview',
  'settings.live_activity',
  'settings.language',
  'settings.theme',
  'settings.whats_new',
  'settings.manual_update',
  'settings.user_guide',
  'settings.offline_cache',
  'settings.app_status',
  'account.usage',
  'status.control_summary',
  'status.plan_limits',
  'status.configuration_details',
  'status.support_link',
  'onboarding.push',
  'background.live_activity',
  'background.ota_updates',
  'background.push_registration',
  'background.client_telemetry',
] as const;

export type FeatureKey = (typeof featureKeys)[number];
export type FeatureMode = 'enabled' | 'disabled' | 'hidden' | 'read_only';

export type FeatureControl = {
  mode: FeatureMode;
  reason: string | null;
};

export type RuntimeAnnouncement = {
  id: string;
  key: string;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning' | 'critical';
  actionLabel: string | null;
  actionUrl: string | null;
  isDismissible: boolean;
};

export type RuntimeLimits = {
  maxSourceKeys: number;
  retentionDays: number;
  accountNotifyRpm: number;
  sourceNotifyRpm: number;
  maxAttachmentBytes: number;
  maxPushDevices: number;
};

export type ReleasePolicy = {
  minimumBuildNumber: number;
  recommendedBuildNumber: number;
  latestBuildNumber: number;
  updateMode: 'none' | 'soft' | 'hard';
  maintenanceMode: boolean;
  message: string | null;
  storeUrl: string | null;
};

export type RuntimeSnapshot = {
  revision: number;
  serverTime: string | null;
  refreshAfterSeconds: number;
  tier: 'standard' | 'premium';
  features: Record<FeatureKey, FeatureControl>;
  settings: Record<string, unknown>;
  limits: RuntimeLimits;
  releasePolicy: ReleasePolicy;
  announcements: RuntimeAnnouncement[];
};

const enabled: FeatureControl = { mode: 'enabled', reason: null };

export const defaultRuntimeSnapshot: RuntimeSnapshot = {
  revision: 0,
  serverTime: null,
  refreshAfterSeconds: 300,
  tier: 'standard',
  features: Object.fromEntries(featureKeys.map((key) => [key, enabled])) as Record<FeatureKey, FeatureControl>,
  settings: {
    'content.user_guide_url': 'https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc',
    'runtime.refresh_seconds': 300,
    'inbox.page_size': 30,
    'inbox.time_filter_hours': 24,
    'inbox.card_title_lines': 1,
    'inbox.card_body_lines': 2,
    'inbox.card_spacing': 6,
    'inbox.max_source_filters': 50,
    'sources.online_window_minutes': 5,
    'sources.search_minimum_count': 4,
    'sources.card_spacing': 6,
    'notification.delivery_poll_seconds': 15,
    'notification.attachment_url_ttl_seconds': 3600,
    'status.config_stale_after_seconds': 900,
    'status.show_internal_revision': false,
    'content.support_url': 'https://github.com/terri-yaki/zona/issues',
    'ui.density': 'comfortable',
  },
  limits: {
    maxSourceKeys: 3,
    retentionDays: 7,
    accountNotifyRpm: 20,
    sourceNotifyRpm: 60,
    maxAttachmentBytes: 5_242_880,
    maxPushDevices: 10,
  },
  releasePolicy: {
    minimumBuildNumber: 0,
    recommendedBuildNumber: 0,
    latestBuildNumber: 0,
    updateMode: 'none',
    maintenanceMode: false,
    message: null,
    storeUrl: null,
  },
  announcements: [],
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** URLs opened by the app must be https; anything else degrades to no URL. */
function httpsUrl(value: unknown): string {
  const url = string(value) ?? '';
  return /^https:\/\//i.test(url) ? url : '';
}

function number(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(value)))
    : fallback;
}

function mode(value: unknown): FeatureMode | null {
  return value === 'enabled' || value === 'disabled' || value === 'hidden' || value === 'read_only'
    ? value
    : null;
}

function parseAnnouncements(value: unknown): RuntimeAnnouncement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const row = object(candidate);
    const id = string(row?.id);
    const key = string(row?.key);
    const title = string(row?.title);
    const body = string(row?.body);
    const tone = row?.tone;
    if (!id || !key || !title || !body || !['info', 'success', 'warning', 'critical'].includes(String(tone))) return [];
    return [{
      id,
      key,
      title,
      body,
      tone: tone as RuntimeAnnouncement['tone'],
      actionLabel: string(row?.actionLabel),
      actionUrl: string(row?.actionUrl),
      isDismissible: row?.isDismissible !== false,
    }];
  });
}

export function parseRuntimeSnapshot(value: unknown): RuntimeSnapshot {
  const root = object(value);
  if (!root) return defaultRuntimeSnapshot;
  const rawFeatures = object(root.features) ?? {};
  const features = { ...defaultRuntimeSnapshot.features };
  for (const key of featureKeys) {
    const control = object(rawFeatures[key]);
    const parsedMode = mode(control?.mode);
    if (parsedMode) features[key] = { mode: parsedMode, reason: string(control?.reason) };
  }

  const settings = object(root.settings) ?? defaultRuntimeSnapshot.settings;
  const limits = object(root.limits) ?? {};
  const policy = object(root.releasePolicy) ?? {};
  const updateMode = policy.update_mode ?? policy.updateMode;

  return {
    revision: number(root.revision, 0),
    serverTime: string(root.serverTime),
    refreshAfterSeconds: number(root.refreshAfterSeconds, 300, 60, 3600),
    tier: root.tier === 'premium' ? 'premium' : 'standard',
    features,
    settings,
    limits: {
      maxSourceKeys: number(limits.maxSourceKeys, 3, 1),
      retentionDays: number(limits.retentionDays, 7, 1, 365),
      accountNotifyRpm: number(limits.accountNotifyRpm, 20, 1),
      sourceNotifyRpm: number(limits.sourceNotifyRpm, 60, 1),
      maxAttachmentBytes: number(limits.maxAttachmentBytes, 5_242_880, 1024, 52_428_800),
      maxPushDevices: number(limits.maxPushDevices, 10, 1, 1000),
    },
    releasePolicy: {
      minimumBuildNumber: number(policy.minimum_build_number ?? policy.minimumBuildNumber, 0),
      recommendedBuildNumber: number(policy.recommended_build_number ?? policy.recommendedBuildNumber, 0),
      latestBuildNumber: number(policy.latest_build_number ?? policy.latestBuildNumber, 0),
      updateMode: updateMode === 'soft' || updateMode === 'hard' ? updateMode : 'none',
      maintenanceMode: (policy.maintenance_mode ?? policy.maintenanceMode) === true,
      message: string(policy.message ?? policy.message_en),
      storeUrl: httpsUrl(policy.store_url ?? policy.storeUrl),
    },
    announcements: parseAnnouncements(root.announcements),
  };
}

export function featureVisible(snapshot: RuntimeSnapshot, key: FeatureKey): boolean {
  return snapshot.features[key].mode !== 'hidden';
}

export function featureEnabled(snapshot: RuntimeSnapshot, key: FeatureKey): boolean {
  return snapshot.features[key].mode === 'enabled';
}

export function runtimeString(snapshot: RuntimeSnapshot, key: string, fallback: string): string {
  const value = snapshot.settings[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function runtimeBoolean(snapshot: RuntimeSnapshot, key: string, fallback: boolean): boolean {
  const value = snapshot.settings[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function runtimeChoice<const T extends string>(
  snapshot: RuntimeSnapshot,
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = snapshot.settings[key];
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}

export function runtimeNumber(
  snapshot: RuntimeSnapshot,
  key: string,
  fallback: number,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  return number(snapshot.settings[key], fallback, minimum, maximum);
}
