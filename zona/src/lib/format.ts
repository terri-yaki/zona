/**
 * Format an ISO timestamp as a short relative phrase.
 * Avoids Intl.RelativeTimeFormat — Hermes on RN often lacks it and throws
 * "Cannot read property 'prototype' of undefined".
 */
export function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1_000);
  const abs = Math.abs(deltaSeconds);
  const past = deltaSeconds <= 0;
  const n = (unit: number) => Math.max(1, Math.round(abs / unit));

  let amount: number;
  let unit: string;
  if (abs < 60) {
    amount = Math.max(1, abs);
    unit = amount === 1 ? 'second' : 'seconds';
  } else if (abs < 3_600) {
    amount = n(60);
    unit = amount === 1 ? 'minute' : 'minutes';
  } else if (abs < 86_400) {
    amount = n(3_600);
    unit = amount === 1 ? 'hour' : 'hours';
  } else if (abs < 604_800) {
    amount = n(86_400);
    unit = amount === 1 ? 'day' : 'days';
  } else {
    // Calendar date is enough past a week; toLocaleDateString is supported on Hermes.
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return new Date(timestamp).toISOString().slice(0, 10);
    }
  }

  return past ? `${amount} ${unit} ago` : `in ${amount} ${unit}`;
}

/**
 * Compact relative phrase for glance surfaces (Live Activity, badges).
 * Returns '' for unparseable input so callers can omit the segment.
 */
export function relativeTimeShort(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (deltaSeconds < 60) return 'now';
  if (deltaSeconds < 3_600) return `${Math.max(1, Math.round(deltaSeconds / 60))}m`;
  if (deltaSeconds < 86_400) return `${Math.max(1, Math.round(deltaSeconds / 3_600))}h`;
  if (deltaSeconds < 604_800) return `${Math.max(1, Math.round(deltaSeconds / 86_400))}d`;

  try {
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

export function sourceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
