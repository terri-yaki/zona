export type AccountUsage = {
  activeKeys: number;
  alertsLast24Hours: number;
  alertsLast7Days: number;
  attachmentBytes: number;
  attachments: number;
  phones: number;
  retainedAlerts: number;
  sources: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
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
  return {
    activeKeys: count(data.activeKeys ?? data.active_keys ?? data.apiKeys ?? data.api_keys ?? nestedValue(data, 'keys', 'active')),
    alertsLast24Hours: count(data.alertsLast24Hours ?? data.alerts_last_24_hours ?? recent.last24Hours ?? recent.last_24_hours),
    alertsLast7Days: count(data.alertsLast7Days ?? data.alerts_last_7_days ?? recent.last7Days ?? recent.last_7_days),
    attachmentBytes: count(data.attachmentBytes ?? data.attachment_bytes ?? attachments?.bytes),
    attachments: count(attachments?.count ?? data.attachmentCount ?? data.attachment_count ?? data.attachments),
    phones: count(data.phones ?? data.installations ?? data.activeInstallations ?? data.active_installations),
    retainedAlerts: count(data.retainedAlerts ?? data.retained_alerts ?? data.notifications ?? nestedValue(data, 'alerts', 'retained')),
    sources: count(data.sources ?? data.activeSources ?? data.active_sources),
  };
}
