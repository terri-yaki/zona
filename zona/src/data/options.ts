import { cachePolicies } from '@/cache/policies';
import { registerCacheResetter } from '@/cache/session';
import {
  currentCacheLease,
  isCacheLeaseCurrent,
  readCache,
  writeCache,
} from '@/cache/store';
import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { AppOptions } from '@/types';

type PreferenceCacheEntry = { fetchedAt: number; value: AppOptions };

const preferenceCache = new Map<string, PreferenceCacheEntry>();
const inFlight = new Map<string, Promise<AppOptions>>();

registerCacheResetter((ownerUserId) => {
  preferenceCache.delete(ownerUserId);
  inFlight.delete(ownerUserId);
});

function isFresh(entry: PreferenceCacheEntry) {
  return Date.now() - entry.fetchedAt <= cachePolicies.preferences.freshForMs;
}

/** Validate RPC preference payloads field-by-field before caching. */
export function sanitizeAppOptions(value: unknown): AppOptions {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    created_at: text(record.created_at) ?? new Date(0).toISOString(),
    is_premium: record.is_premium === true,
    live_activity_enabled: record.live_activity_enabled === true,
    play_sound: record.play_sound !== false,
    premium_customer_id: text(record.premium_customer_id),
    premium_expires_at: text(record.premium_expires_at),
    premium_plan: text(record.premium_plan),
    premium_product_id: text(record.premium_product_id),
    premium_status: text(record.premium_status),
    premium_store: text(record.premium_store),
    push_enabled: record.push_enabled !== false,
    show_preview: record.show_preview !== false,
    updated_at: text(record.updated_at) ?? new Date(0).toISOString(),
    user_id: text(record.user_id) ?? '',
  };
}

export async function getCachedAppOptions(userId: string): Promise<AppOptions | null> {
  const memory = preferenceCache.get(userId);
  if (memory) return memory.value;
  const cached = await readCache<AppOptions>(userId, 'preferences');
  if (!cached.value) return null;
  preferenceCache.set(userId, { fetchedAt: cached.fetchedAt, value: cached.value });
  return cached.value;
}

export async function getAppOptions(userId: string, force = false): Promise<AppOptions> {
  const memory = preferenceCache.get(userId);
  if (!force && memory && isFresh(memory)) return memory.value;

  if (!force && !memory) {
    const cached = await readCache<AppOptions>(userId, 'preferences');
    if (cached.value) {
      const entry = { fetchedAt: cached.fetchedAt, value: cached.value };
      preferenceCache.set(userId, entry);
      if (cached.state === 'fresh') return entry.value;
    }
  }

  const existing = inFlight.get(userId);
  if (existing) return existing;
  const lease = currentCacheLease(userId);
  const request = (async () => {
    const { data, error } = await supabase.rpc('get_user_notification_preferences');
    if (error) throw dataError(error, translate('settings.optionsLoadError'));
    const value = sanitizeAppOptions(data);
    if (!isCacheLeaseCurrent(lease)) return value;
    const fetchedAt = Date.now();
    preferenceCache.set(userId, { fetchedAt, value });
    try {
      await writeCache(userId, 'preferences', 'default', value, { fetchedAt, lease });
    } catch (storageError) {
      console.warn('Could not cache notification preferences.', storageError);
    }
    return value;
  })().finally(() => inFlight.delete(userId));
  inFlight.set(userId, request);
  return request;
}

export type AppOptionFlags = Pick<
  AppOptions,
  'push_enabled' | 'play_sound' | 'show_preview' | 'live_activity_enabled'
>;

export async function updateAppOptions(
  userId: string,
  changes: Partial<AppOptionFlags>,
): Promise<AppOptions> {
  const lease = currentCacheLease(userId);
  const { data, error } = await supabase.rpc('update_user_notification_preferences', {
    p_push_enabled: changes.push_enabled ?? null,
    p_play_sound: changes.play_sound ?? null,
    p_show_preview: changes.show_preview ?? null,
    p_live_activity_enabled: changes.live_activity_enabled ?? null,
  });
  if (error) throw dataError(error, translate('settings.optionSaveError'));
  const value = sanitizeAppOptions(data);
  if (isCacheLeaseCurrent(lease)) {
    const fetchedAt = Date.now();
    preferenceCache.set(userId, { fetchedAt, value });
    try {
      await writeCache(userId, 'preferences', 'default', value, { fetchedAt, lease });
    } catch (storageError) {
      console.warn('Could not cache notification preferences.', storageError);
    }
  }
  return value;
}
