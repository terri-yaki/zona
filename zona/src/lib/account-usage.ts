export type AccountUsage = {
  activeKeys: number;
  alertsLast24Hours: number;
  alertsLast7Days: number;
  attachmentBytes: number;
  attachments: number;
  limits: AccountUsageLimits;
  phones: number;
  retainedAlerts: number;
  sources: number;
};

export type AccountUsageLimits = {
  accountNotifyRpm: number | null;
  maxAccessKeysPerSource: number | null;
  maxAttachmentBytes: number | null;
  maxPushDevices: number | null;
  maxSourceKeys: number | null;
  retentionDays: number | null;
  sourceNotifyRpm: number | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function limit(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nestedValue(container: Record<string, unknown>, key: string, nestedKey: string) {
  const nested = container[key];
  return record(nested) ? nested[nestedKey] : undefined;
}

export function parseAccountUsage(data: unknown): AccountUsage {
  if (!record(data)) throw new Error('INVALID_ACCOUNT_USAGE_RESPONSE');
  const recentValue = data.recentAlerts ?? data.recent_alerts ?? data.recentAlertVolume;
  const recent = record(recentValue) ? recentValue : {};
  const attachments = record(data.attachments) ? data.attachments : null;
  const limits = record(data.limits) ? data.limits : {};
  return {
    activeKeys: count(data.activeKeys ?? data.active_keys ?? data.apiKeys ?? data.api_keys ?? nestedValue(data, 'keys', 'active')),
    alertsLast24Hours: count(data.alertsLast24Hours ?? data.alerts_last_24_hours ?? recent.last24Hours ?? recent.last_24_hours),
    alertsLast7Days: count(data.alertsLast7Days ?? data.alerts_last_7_days ?? recent.last7Days ?? recent.last_7_days),
    attachmentBytes: count(data.attachmentBytes ?? data.attachment_bytes ?? attachments?.bytes),
    attachments: count(attachments?.count ?? data.attachmentCount ?? data.attachment_count ?? data.attachments),
    limits: {
      accountNotifyRpm: limit(limits.accountNotifyRpm ?? limits.account_notify_rpm),
      maxAccessKeysPerSource: limit(limits.maxAccessKeysPerSource ?? limits.max_access_keys_per_source),
      maxAttachmentBytes: limit(limits.maxAttachmentBytes ?? limits.max_attachment_bytes),
      maxPushDevices: limit(limits.maxPushDevices ?? limits.max_push_devices),
      maxSourceKeys: limit(limits.maxSourceKeys ?? limits.max_source_keys),
      retentionDays: limit(limits.retentionDays ?? limits.retention_days),
      sourceNotifyRpm: limit(limits.sourceNotifyRpm ?? limits.source_notify_rpm),
    },
    phones: count(data.phones ?? data.installations ?? data.activeInstallations ?? data.active_installations),
    retainedAlerts: count(data.retainedAlerts ?? data.retained_alerts ?? data.notifications ?? nestedValue(data, 'alerts', 'retained')),
    sources: count(data.sources ?? data.activeSources ?? data.active_sources),
  };
}

export function formatAccountUsageBytes(bytes: number) {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safeBytes < 1024) return `${Math.floor(safeBytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = safeBytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value < 10 && !Number.isInteger(value) ? 1 : 0;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
