import { colors } from '@/theme';
import { getActiveThemePreset } from '@/theme-preference';
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

/**
 * Severity palettes are appearance-aware. Light presets keep the soft candy
 * tints, which pair with dark theme text. Dark presets use deep tints instead:
 * the pastel set would put the theme's near-white title/body text on a light
 * card (the light-on-light bug), while these keep both `colors.text` and
 * `colors.muted` above WCAG AA — asserted per preset in theme-contrast.test.
 */
const lightAppearances: Record<NotificationSeverity, SeverityAppearance> = {
  low: { background: '#E8F9E5', border: '#C5EDC0', icon: '#35B968' },
  medium: { background: '#FFF5C7', border: '#F1DE8B', icon: '#D5A514' },
  high: { background: '#FFE6C9', border: '#F4C58F', icon: '#ED8129' },
  critical: { background: '#FFDCE3', border: '#F2A9B7', icon: '#E9435D' },
};

const darkAppearances: Record<NotificationSeverity, SeverityAppearance> = {
  low: { background: '#0F2A1E', border: '#1F5C41', icon: '#2BD97C' },
  medium: { background: '#2E2710', border: '#6B5A1B', icon: '#E8C94A' },
  high: { background: '#33200F', border: '#7A4A1D', icon: '#F29B4D' },
  critical: { background: '#38121F', border: '#7A2438', icon: '#FF6B84' },
};

export function severityAppearancesFor(appearance: 'light' | 'dark'): Record<NotificationSeverity, SeverityAppearance> {
  return appearance === 'dark' ? darkAppearances : lightAppearances;
}

export function severityAppearance(severity: NotificationSeverity | null): SeverityAppearance {
  return severity ? severityAppearancesFor(getActiveThemePreset().appearance)[severity] : neutral();
}
