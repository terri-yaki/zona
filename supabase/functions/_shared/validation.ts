/** Single source of truth for the reauth grant shape (handler + tests). */
export const reauthGrantPattern = /^zona_reauth_[0-9a-f]{64}$/;

export function requiredString(value: unknown, maximum: number, code = 'INVALID_PAYLOAD'): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(code);
  return normalized;
}

export function optionalString(value: unknown, maximum: number, code = 'INVALID_PAYLOAD'): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(code);
  return normalized;
}

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('INVALID_SOURCE');
  }
  return value;
}

export function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_IDEMPOTENCY_KEY');
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(normalized)) {
    throw new Error('INVALID_IDEMPOTENCY_KEY');
  }
  return normalized;
}
