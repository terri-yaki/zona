import type { NotificationSeverity } from '@/types/database';

export type SeverityAppearance = {
  background: string;
  border: string;
  icon: string;
};

const neutral: SeverityAppearance = {
  background: '#FFFFFF',
  border: '#E9EEEB',
  icon: '#2F6B5F',
};

const appearances: Record<NotificationSeverity, SeverityAppearance> = {
  low: { background: '#E8F9E5', border: '#C5EDC0', icon: '#35B968' },
  medium: { background: '#FFF5C7', border: '#F1DE8B', icon: '#D5A514' },
  high: { background: '#FFE6C9', border: '#F4C58F', icon: '#ED8129' },
  critical: { background: '#FFDCE3', border: '#F2A9B7', icon: '#E9435D' },
};

export function severityAppearance(severity: NotificationSeverity | null): SeverityAppearance {
  return severity ? appearances[severity] : neutral;
}
