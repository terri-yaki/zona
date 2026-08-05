import { translate } from '../i18n';
import type { DeleteAccountResult } from '../types';

export const limits = {
  passwordMinBytes: 8,
  passwordMaxBytes: 72,
  sourceName: 80,
  hostname: 255,
  title: 120,
  body: 2_000,
  category: 80,
};

export function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  let length = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) {
      length += 1;
    } else if (code <= 0x7ff) {
      length += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        length += 4;
        i += 1;
      } else {
        length += 3;
      }
    } else {
      length += 3;
    }
  }
  return length;
}

export function validateAuthPassword(password: string): string | null {
  if (password.length === 0) return translate('validation.passwordRequired');
  if (password !== password.trim()) return translate('validation.passwordWhitespace');
  const bytes = utf8ByteLength(password);
  if (bytes < limits.passwordMinBytes) return translate('validation.passwordTooShort', { count: limits.passwordMinBytes });
  if (bytes > limits.passwordMaxBytes) return translate('validation.passwordTooLong', { count: limits.passwordMaxBytes });
  return null;
}

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

export function isDeleteAccountResult(value: unknown, expectedUserId: string): value is DeleteAccountResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Partial<DeleteAccountResult>;
  if (result.deleted !== true || result.userId !== expectedUserId) return false;
  if (!result.cleanup || typeof result.cleanup !== 'object') return false;

  return [
    result.cleanup.apiKeys,
    result.cleanup.appOptions,
    result.cleanup.attachments,
    result.cleanup.notifications,
    result.cleanup.pushDevices,
    result.cleanup.rateEvents,
    result.cleanup.sourceCredentials,
    result.cleanup.sources,
  ].every((count) => Number.isInteger(count) && Number(count) >= 0);
}
