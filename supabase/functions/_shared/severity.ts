export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical';

const severityColors: Record<NotificationSeverity, string> = {
  low: '#35B968',
  medium: '#D5A514',
  high: '#ED8129',
  critical: '#E9435D',
};

export function parseSeverity(value: unknown): NotificationSeverity | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('INVALID_PAYLOAD');
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized;
  }
  throw new Error('INVALID_PAYLOAD');
}

export function severityColor(severity: NotificationSeverity | null): string | undefined {
  return severity ? severityColors[severity] : undefined;
}
