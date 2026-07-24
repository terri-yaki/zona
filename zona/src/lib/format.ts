import { getActiveLanguage, getLocaleTag, translate, translateCount } from '../i18n';

/**
 * Format an ISO timestamp as a short relative phrase.
 * Avoids Intl.RelativeTimeFormat — Hermes on RN often lacks it and throws
 * "Cannot read property 'prototype' of undefined".
 */
export function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return translate('time.unknown');

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1_000);
  const abs = Math.abs(deltaSeconds);
  const past = deltaSeconds <= 0;
  const n = (unit: number) => Math.max(1, Math.round(abs / unit));

  let amount: number;
  let phrase: string;
  if (abs < 60) {
    amount = Math.max(1, abs);
    phrase = translateCount('time.second.one', 'time.second.other', amount);
  } else if (abs < 3_600) {
    amount = n(60);
    phrase = translateCount('time.minute.one', 'time.minute.other', amount);
  } else if (abs < 86_400) {
    amount = n(3_600);
    phrase = translateCount('time.hour.one', 'time.hour.other', amount);
  } else if (abs < 604_800) {
    amount = n(86_400);
    phrase = translateCount('time.day.one', 'time.day.other', amount);
  } else {
    // Calendar date is enough past a week; toLocaleDateString is supported on Hermes.
    try {
      return new Date(timestamp).toLocaleDateString(getLocaleTag());
    } catch {
      return new Date(timestamp).toISOString().slice(0, 10);
    }
  }

  return past ? translate('time.ago', { value: phrase }) : translate('time.in', { value: phrase });
}

/**
 * Compact relative phrase for glance surfaces (Live Activity, badges).
 * Returns '' for unparseable input so callers can omit the segment.
 */
export function relativeTimeShort(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (deltaSeconds < 60) return translate('time.now');
  if (deltaSeconds < 3_600) return translate('time.shortMinute', { count: Math.max(1, Math.round(deltaSeconds / 60)) });
  if (deltaSeconds < 86_400) return translate('time.shortHour', { count: Math.max(1, Math.round(deltaSeconds / 3_600)) });
  if (deltaSeconds < 604_800) return translate('time.shortDay', { count: Math.max(1, Math.round(deltaSeconds / 86_400)) });

  try {
    return new Date(timestamp).toLocaleDateString(getLocaleTag());
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

export function sourceInitial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase(getLocaleTag(getActiveLanguage())) || '?';
}
