import Constants from 'expo-constants';

/** Installed app version from the Expo config (app.json `version`). */
export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

function parseVersion(version: string): number[] | null {
  const parts = version.trim().split('.');
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 10));
}

/**
 * Numeric dotted-version comparison: missing segments count as 0 and
 * unparseable input never passes ('0.0.11' ≥ '0.0.10', '0.0' < '0.0.10').
 */
export function versionAtLeast(version: string, minimum: string): boolean {
  const parsed = parseVersion(version);
  const floor = parseVersion(minimum);
  if (!parsed || !floor) return false;
  const length = Math.max(parsed.length, floor.length);
  for (let index = 0; index < length; index += 1) {
    const part = parsed[index] ?? 0;
    const target = floor[index] ?? 0;
    if (part !== target) return part > target;
  }
  return true;
}

/**
 * The delivery-status surfaces (notification detail Delivery card and the
 * Settings "Device delivery" section) require app version 0.0.10 or later;
 * older clients never render them regardless of runtime-control state.
 */
export const DELIVERY_STATUS_MIN_APP_VERSION = '0.0.10';

export function deliveryStatusVisibleForVersion(version: string): boolean {
  return versionAtLeast(version, DELIVERY_STATUS_MIN_APP_VERSION);
}

export function deliveryStatusVisible(): boolean {
  return deliveryStatusVisibleForVersion(currentAppVersion());
}
