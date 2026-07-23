export function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1_000);
  const absolute = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absolute < 60) return formatter.format(deltaSeconds, 'second');
  if (absolute < 3_600) return formatter.format(Math.round(deltaSeconds / 60), 'minute');
  if (absolute < 86_400) return formatter.format(Math.round(deltaSeconds / 3_600), 'hour');
  if (absolute < 604_800) return formatter.format(Math.round(deltaSeconds / 86_400), 'day');
  return new Date(value).toLocaleDateString();
}

export function sourceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
