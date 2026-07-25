import { beforeEach, describe, expect, it } from 'vitest';

import { isDeleteAccountResult, isUuid, normalizeOptional, validateSourceInput } from '../lib/validation';
import { setActiveLanguage } from '../i18n';

beforeEach(() => setActiveLanguage('en'));

describe('source validation', () => {
  it('requires a source name', () => {
    expect(validateSourceInput('   ', '')).toBe('Enter a source name.');
  });

  it('accepts a normal source and hostname', () => {
    expect(validateSourceInput('Render PC', 'render-01')).toBeNull();
  });

  it('normalizes optional values', () => {
    expect(normalizeOptional('   ')).toBeNull();
    expect(normalizeOptional(' pc-1 ')).toBe('pc-1');
  });

  it('accepts only UUID notification identifiers', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('../settings')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('account deletion response validation', () => {
  const cleanup = {
    apiKeys: 2,
    appOptions: 1,
    attachments: 3,
    notifications: 4,
    pushDevices: 1,
    rateEvents: 5,
    sourceCredentials: 2,
    sources: 2,
  };

  it('accepts proof for the exact requested account', () => {
    expect(isDeleteAccountResult({ deleted: true, userId: 'account-a', cleanup }, 'account-a')).toBe(true);
  });

  it('rejects another account or incomplete cleanup proof', () => {
    expect(isDeleteAccountResult({ deleted: true, userId: 'account-b', cleanup }, 'account-a')).toBe(false);
    expect(isDeleteAccountResult({ deleted: true, userId: 'account-a' }, 'account-a')).toBe(false);
  });
});
