import { describe, expect, it } from 'vitest';

import { severityAppearance } from '../lib/notification-severity';

describe('notification severity appearance', () => {
  it('keeps notifications without severity white', () => {
    expect(severityAppearance(null)).toEqual({
      background: '#FFFFFF',
      border: '#E9EEEB',
      icon: '#2F6B5F',
    });
  });

  it('uses progressively warmer candy colors', () => {
    expect(severityAppearance('low').icon).toBe('#35B968');
    expect(severityAppearance('medium').icon).toBe('#D5A514');
    expect(severityAppearance('high').icon).toBe('#ED8129');
    expect(severityAppearance('critical').icon).toBe('#E9435D');
  });
});
