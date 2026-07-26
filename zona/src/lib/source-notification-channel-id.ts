export function sourceNotificationChannelId(sourceId: string): string {
  const normalized = sourceId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `zona_source_${normalized}`;
}
