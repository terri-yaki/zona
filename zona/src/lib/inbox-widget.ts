import { Platform } from 'react-native';

import type { InboxNotification } from '@/types';
import type { ZonaInboxWidgetProps } from '../../widgets/ZonaInboxWidget';

export function buildInboxWidgetProps(
  items: InboxNotification[],
  unreadCount: number,
): ZonaInboxWidgetProps {
  const latest = items.find((item) => !item.read_at) ?? items[0];
  return {
    latestSource: latest?.source_name_snapshot ?? 'Zona',
    latestTitle: latest?.title ?? 'Nothing needs you right now.',
    severity: latest?.severity ?? 'default',
    unreadCount: Math.max(0, unreadCount),
  };
}

export function syncInboxWidget(items: InboxNotification[], unreadCount: number) {
  if (Platform.OS !== 'ios' || typeof __DEV__ === 'undefined') return false;
  try {
    // Load the native widget only on iOS. This keeps Android, web, and unit
    // test runtimes independent from the WidgetKit module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ZonaInboxWidget = require('../../widgets/ZonaInboxWidget').default as {
      updateSnapshot(props: ZonaInboxWidgetProps): void;
    };
    ZonaInboxWidget.updateSnapshot(buildInboxWidgetProps(items, unreadCount));
    return true;
  } catch (error) {
    console.warn('Could not update the Zona inbox widget.', error);
    return false;
  }
}
