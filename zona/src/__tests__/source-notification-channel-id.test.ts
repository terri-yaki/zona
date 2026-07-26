import { describe, expect, it } from 'vitest';

import { sourceNotificationChannelId } from '../lib/source-notification-channel-id';

describe('source notification channel ids', () => {
  it('creates a stable Android-safe id from a source UUID', () => {
    expect(sourceNotificationChannelId('F214DF2F-71B3-4087-AB11-A44514D4930A'))
      .toBe('zona_source_f214df2f_71b3_4087_ab11_a44514d4930a');
  });
});
