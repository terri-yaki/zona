import { describe, expect, it } from 'vitest';

import { isUuid, normalizeOptional, validateSourceInput } from '../lib/validation';

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
