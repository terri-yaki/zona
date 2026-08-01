import { describe, expect, it } from 'vitest';

import { notificationActionText } from '../lib/notification-actions';
import type { InboxNotification } from '../types';

const notification: InboxNotification = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  source_id: '00000000-0000-4000-8000-000000000003',
  source_name_snapshot: 'Build agent',
  title: 'Build complete',
  body: 'The release is ready.',
  category: 'release',
  severity: 'critical',
  data: { private: 'not shared' },
  created_at: '2026-08-01T12:00:00.000Z',
  read_at: null,
  expires_at: '2026-08-08T12:00:00.000Z',
  attachment_bytes: null,
  attachment_mime: null,
  attachment_path: null,
};

describe('notificationActionText', () => {
  it('formats useful notification details without metadata or identifiers', () => {
    const text = notificationActionText(notification, 'en-US');
    expect(text).toContain('Build complete\nThe release is ready.');
    expect(text).toContain('Source: Build agent');
    expect(text).toContain('Category: release');
    expect(text).toContain('Severity: critical');
    expect(text).not.toContain('private');
    expect(text).not.toContain(notification.id);
  });

  it('omits empty optional labels', () => {
    const text = notificationActionText({ ...notification, category: null, severity: null }, 'en-US');
    expect(text).not.toContain('Category:');
    expect(text).not.toContain('Severity:');
  });

  it('uses Traditional Chinese labels for a Chinese locale', () => {
    const text = notificationActionText(notification, 'zh-Hant-HK');
    expect(text).toContain('來源: Build agent');
    expect(text).toContain('類別: release');
    expect(text).toContain('嚴重程度: critical');
    expect(text).toContain('傳送時間:');
  });
});
