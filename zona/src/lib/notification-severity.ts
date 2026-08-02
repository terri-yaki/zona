import { colors } from '@/theme';
import type { NotificationSeverity } from '@/types/database';

export type SeverityAppearance = {
  background: string;
  border: string;
  icon: string;
};

/**
 * Neutral cards follow the active theme preset. Read the live-bound `colors`
 * inside the function (not at module load) so a theme switch repaints cards
 * that have no explicit severity.
 */
function neutral(): SeverityAppearance {
  return {
    background: colors.surface,
    border: colors.border,
    icon: colors.primary,
  };
}

const appearances: Record<NotificationSeverity, SeverityAppearance> = {
  low: { background: '#E8F9E5', border: '#C5EDC0', icon: '#35B968' },
  medium: { background: '#FFF5C7', border: '#F1DE8B', icon: '#D5A514' },
  high: { background: '#FFE6C9', border: '#F4C58F', icon: '#ED8129' },
  critical: { background: '#FFDCE3', border: '#F2A9B7', icon: '#E9435D' },
};

export function severityAppearance(severity: NotificationSeverity | null): SeverityAppearance {
  return severity ? appearances[severity] : neutral();
}
