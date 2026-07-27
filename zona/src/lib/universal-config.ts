// Pure resolution of the operator-configured universal app options, kept free
// of transport imports so it stays unit-testable.

// Last-resort values matching the seeded database row; used only when the
// universal options cannot be loaded (offline, pre-auth, or read failure).
export const FALLBACK_USER_GUIDE_URL = 'https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc';
export const FALLBACK_RETENTION_DAYS = 7;

export type UniversalConfigRow = {
  user_guide_url: string;
  retention_days_standard: number;
  retention_days_premium: number;
};

export type UniversalConfig = {
  userGuideUrl: string;
  retentionDays: number;
};

// The caller passes the server-resolved premium flag from the user's own
// app_options row; the client never decides the tier itself.
export function resolveUniversalConfig(
  row: UniversalConfigRow | null,
  isPremium: boolean,
): UniversalConfig {
  const retentionDays = isPremium
    ? row?.retention_days_premium ?? FALLBACK_RETENTION_DAYS
    : row?.retention_days_standard ?? FALLBACK_RETENTION_DAYS;
  return {
    userGuideUrl: row?.user_guide_url ?? FALLBACK_USER_GUIDE_URL,
    retentionDays: retentionDays > 0 ? retentionDays : FALLBACK_RETENTION_DAYS,
  };
}
