import type { InboxNotification } from '@/types';

export function notificationActionText(item: InboxNotification, locale: string): string {
  const labels = locale.toLocaleLowerCase().startsWith('zh')
    ? { category: '類別', sent: '傳送時間', severity: '嚴重程度', source: '來源' }
    : { category: 'Category', sent: 'Sent', severity: 'Severity', source: 'Source' };
  const lines = [
    item.title,
    item.body,
    '',
    `${labels.source}: ${item.source_name_snapshot}`,
    item.category ? `${labels.category}: ${item.category}` : null,
    item.severity ? `${labels.severity}: ${item.severity}` : null,
    `${labels.sent}: ${new Date(item.created_at).toLocaleString(locale)}`,
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}
