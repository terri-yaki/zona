import { translate } from '../i18n';

export const limits = {
  sourceName: 80,
  hostname: 255,
  title: 120,
  body: 2_000,
  category: 80,
};

export function normalizeOptional(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function validateSourceInput(displayName: string, hostname: string): string | null {
  const name = displayName.trim();
  if (name.length === 0) return translate('validation.sourceNameRequired');
  if (name.length > limits.sourceName) return translate('validation.sourceNameMax', { count: limits.sourceName });
  if (hostname.trim().length > limits.hostname) return translate('validation.hostnameMax', { count: limits.hostname });
  return null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
