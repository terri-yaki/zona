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
  if (name.length === 0) return 'Enter a source name.';
  if (name.length > limits.sourceName) return `Source names must be ${limits.sourceName} characters or fewer.`;
  if (hostname.trim().length > limits.hostname) return `Hostnames must be ${limits.hostname} characters or fewer.`;
  return null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
