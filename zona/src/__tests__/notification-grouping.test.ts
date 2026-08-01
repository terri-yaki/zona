import { describe, expect, it } from 'vitest';

import { groupRepeatedNotifications } from '../lib/notification-grouping';
import type { InboxNotification } from '../types';

function alert(id: string, createdAt: string, title = 'Build failed'): InboxNotification {
  return {
    attachment_bytes: null,
    attachment_mime: null,
    attachment_path: null,
    body: 'Tests failed',
    category: 'build',
    created_at: createdAt,
    data: {},
    expires_at: '2026-08-08T00:00:00Z',
    id,
    pinned_at: null,
    push_suppressed_reason: null,
    read_at: null,
    severity: 'high',
    source_id: 'source-1',
    source_name_snapshot: 'Office PC',
    title,
    user_id: 'user-1',
  };
}

describe('notification grouping', () => {
  it('groups adjacent identical alerts from the same source inside the window', () => {
    const groups = groupRepeatedNotifications([
      alert('a', '2026-08-01T12:10:00Z'),
      alert('b', '2026-08-01T12:00:00Z'),
      alert('c', '2026-08-01T11:50:00Z', 'Recovered'),
    ]);
    expect(groups.map((group) => group.items.length)).toEqual([2, 1]);
    expect(groups[0].latest.id).toBe('a');
  });

  it('does not group alerts outside the repeat window', () => {
    expect(groupRepeatedNotifications([
      alert('a', '2026-08-01T13:00:00Z'),
      alert('b', '2026-08-01T12:00:00Z'),
    ])).toHaveLength(2);
  });
});

