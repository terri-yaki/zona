import { getCalendars } from 'expo-localization';

function clean(value: string | null | undefined) {
  const timezone = value?.trim();
  return timezone || null;
}

export function resolveDeviceTimeZone(
  calendarTimeZone = getCalendars()[0]?.timeZone,
  intlTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return clean(calendarTimeZone) ?? clean(intlTimeZone) ?? 'UTC';
}
