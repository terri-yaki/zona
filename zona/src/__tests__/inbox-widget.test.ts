import { describe, expect, it } from 'vitest';

import { buildInboxWidgetProps } from '../lib/inbox-widget';
import type { InboxNotification } from '../types';

function notification(overrides: Partial<InboxNotification>): InboxNotification {
  return {
    attachment_bytes: null,
    attachment_mime: null,
    attachment_path: null,
    body: 'Body',
    category: null,
    created_at: '2026-08-01T10:00:00Z',
    data: {},
    expires_at: '2026-08-08T10:00:00Z',
    id: '00000000-0000-4000-8000-000000000001',
    read_at: null,
    severity: null,
    source_id: '00000000-0000-4000-8000-000000000002',
    source_name_snapshot: 'Build agent',
    title: 'Build finished',
    user_id: '00000000-0000-4000-8000-000000000003',
    ...overrides,
  };
}

describe('buildInboxWidgetProps', () => {
  it('uses the latest unread alert and severity', () => {
    const props = buildInboxWidgetProps([
      notification({ read_at: '2026-08-01T10:01:00Z', title: 'Already read' }),
      notification({ id: '00000000-0000-4000-8000-000000000004', severity: 'critical', title: 'Deploy failed' }),
    ], 1);
    expect(props).toMatchObject({ latestSource: 'Build agent', latestTitle: 'Deploy failed', severity: 'critical', unreadCount: 1 });
  });

  it('provides an all-clear snapshot for an empty inbox', () => {
    expect(buildInboxWidgetProps([], -2)).toEqual({
      latestSource: 'Zona',
      latestTitle: 'Nothing needs you right now.',
      severity: 'default',
      unreadCount: 0,
    });
  });
});
