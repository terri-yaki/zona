import { env } from './env';

export type AuthCapabilities = {
  anonymous: boolean;
  apple: boolean;
  email: boolean;
  github: boolean;
  google: boolean;
};

const fallback: AuthCapabilities = {
  anonymous: true,
  apple: false,
  email: false,
  github: false,
  google: false,
};

let cached: { expiresAt: number; value: AuthCapabilities } | null = null;

function enabled(record: Record<string, unknown>, key: string, defaultValue: boolean) {
  const value = record[key];
  return typeof value === 'boolean' ? value : defaultValue;
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
    const payload = await response.json() as { external?: unknown };
    const external = payload.external && typeof payload.external === 'object'
      ? payload.external as Record<string, unknown>
      : {};
    const value = {
      anonymous: enabled(external, 'anonymous_users', fallback.anonymous),
      apple: enabled(external, 'apple', false),
      email: enabled(external, 'email', fallback.email),
      github: enabled(external, 'github', false),
      google: enabled(external, 'google', false),
    };
    cached = { expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
