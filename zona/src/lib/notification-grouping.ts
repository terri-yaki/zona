import type { InboxNotification } from '@/types';

export type NotificationGroup = {
  id: string;
  items: InboxNotification[];
  latest: InboxNotification;
};

function signature(item: InboxNotification) {
  return [
    item.source_id,
    item.title,
    item.body,
    item.category ?? '',
    item.severity ?? '',
  ].join('\u0000');
}

export function groupRepeatedNotifications(
  items: InboxNotification[],
  windowMilliseconds = 30 * 60 * 1_000,
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const item of items) {
    const previous = groups.at(-1);
    const withinWindow = previous
      ? Math.abs(new Date(previous.items.at(-1)!.created_at).getTime() - new Date(item.created_at).getTime()) <= windowMilliseconds
      : false;
    if (previous && signature(previous.latest) === signature(item) && withinWindow) {
      previous.items.push(item);
    } else {
      groups.push({ id: item.id, items: [item], latest: item });
    }
  }
  return groups;
}

