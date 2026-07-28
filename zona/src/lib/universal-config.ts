// Pure resolution of the operator-configured universal app options, kept free
// of transport imports so it stays unit-testable.

// Last-resort values matching the seeded database rows; used only when the
// universal options cannot be loaded (offline, pre-auth, or read failure).
export const FALLBACK_USER_GUIDE_URL = 'https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc';
export const FALLBACK_RETENTION_DAYS = 7;

export type UniversalAppOptionRow = {
  option_name: string;
  value: string;
};

export type UniversalConfig = {
  userGuideUrl: string;
  retentionDays: number;
};

function findOption(rows: UniversalAppOptionRow[] | null, name: string): string | null {
  return rows?.find((row) => row.option_name === name)?.value ?? null;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// The caller passes the server-resolved premium flag from the user's own
// app_options row; the client never decides the tier itself.
export function resolveUniversalConfig(
  rows: UniversalAppOptionRow[] | null,
  isPremium: boolean,
): UniversalConfig {
  const retentionKey = isPremium ? 'retention_days_premium' : 'retention_days_standard';
  return {
    userGuideUrl: findOption(rows, 'user_guide_url') ?? FALLBACK_USER_GUIDE_URL,
    retentionDays: parsePositiveInt(findOption(rows, retentionKey), FALLBACK_RETENTION_DAYS),
  };
}
