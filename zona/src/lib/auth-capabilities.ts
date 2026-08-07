import { env } from './env';

export type AuthCapabilities = {
  anonymous: boolean;
  apple: boolean;
  email: boolean;
  github: boolean;
  google: boolean;
};

/**
 * Defaults when /auth/v1/settings is slow or fails.
 * Email is a product recovery path and stays available even when the public
 * settings payload incorrectly reports email off (common GoTrue misconfig).
 * OAuth follows the server. Guest is optional and not required for first join.
 */
export const fallbackAuthCapabilities: AuthCapabilities = {
  anonymous: false,
  apple: false,
  email: true,
  github: false,
  google: false,
};

let cached: { expiresAt: number; value: AuthCapabilities } | null = null;

function enabled(record: Record<string, unknown>, key: string, defaultValue: boolean) {
  const value = record[key];
  return typeof value === 'boolean' ? value : defaultValue;
}

/** Product floor: always offer email recovery; OAuth only when server enables it. */
export function applyProductAuthFloor(capabilities: AuthCapabilities): AuthCapabilities {
  return {
    ...capabilities,
    email: true,
  };
}

export function parseAuthCapabilities(payload: unknown): AuthCapabilities {
  const external = payload && typeof payload === 'object' && !Array.isArray(payload)
    && (payload as { external?: unknown }).external
    && typeof (payload as { external?: unknown }).external === 'object'
    && !Array.isArray((payload as { external?: unknown }).external)
    ? (payload as { external: Record<string, unknown> }).external
    : {};
  const parsed: AuthCapabilities = {
    anonymous: enabled(external, 'anonymous_users', fallbackAuthCapabilities.anonymous),
    apple: enabled(external, 'apple', fallbackAuthCapabilities.apple),
    email: enabled(external, 'email', fallbackAuthCapabilities.email),
    github: enabled(external, 'github', fallbackAuthCapabilities.github),
    google: enabled(external, 'google', fallbackAuthCapabilities.google),
  };
  return applyProductAuthFloor(parsed);
}

/** Non-guest methods the product can surface (sign-in or Account link). */
export function nonGuestAuthMethodsEnabled(capabilities: AuthCapabilities) {
  return capabilities.email
    || capabilities.apple
    || capabilities.google
    || capabilities.github;
}

/** First-join: at least one recoverable path. */
export function firstJoinShowsNonGuestMethods(capabilities: AuthCapabilities) {
  return nonGuestAuthMethodsEnabled(capabilities);
}

export async function getAuthCapabilities(): Promise<AuthCapabilities> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabasePublishableKey },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AUTH_SETTINGS_${response.status}`);
    const value = parseAuthCapabilities(await response.json());
    cached = { expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  } catch {
    return applyProductAuthFloor(fallbackAuthCapabilities);
  } finally {
    clearTimeout(timeout);
  }
}

/** Test helper: drop the in-memory settings cache. */
export function clearAuthCapabilitiesCache() {
  cached = null;
}
