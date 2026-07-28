import AsyncStorage from '@react-native-async-storage/async-storage';

import { cachePolicies } from './policies';
import type { CacheEnvelope, CacheLease, CacheRead, CacheResource } from './types';

const cachePrefix = 'zona.cache.v1';

function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function encodedVariant(variant: string) {
  return encodeURIComponent(variant || 'default');
}

export function cacheStorageKey(ownerUserId: string, resource: CacheResource, variant = 'default') {
  return `${cachePrefix}.${ownerUserId}.${resource}.${encodedVariant(variant)}`;
}

function resourcePrefix(ownerUserId: string, resource?: CacheResource) {
  return `${cachePrefix}.${ownerUserId}${resource ? `.${resource}.` : '.'}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEnvelope<T>(
  raw: string,
  ownerUserId: string,
  resource: CacheResource,
  variant: string,
): CacheEnvelope<T> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)
      || parsed.schemaVersion !== 1
      || parsed.ownerUserId !== ownerUserId
      || parsed.resource !== resource
      || parsed.variant !== variant
      || typeof parsed.fetchedAt !== 'number'
      || typeof parsed.lastAccessedAt !== 'number'
      || typeof parsed.dirty !== 'boolean'
      || !('value' in parsed)) {
      return null;
    }
    return parsed as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

export async function readCache<T>(
  ownerUserId: string,
  resource: CacheResource,
  variant = 'default',
  freshForMs = cachePolicies[resource].freshForMs,
): Promise<CacheRead<T>> {
  const key = cacheStorageKey(ownerUserId, resource, variant);
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (error) {
    console.warn(`Could not read the ${resource} cache.`, error);
  }
  if (!raw) return { fetchedAt: 0, state: 'miss', value: null };

  const envelope = parseEnvelope<T>(raw, ownerUserId, resource, variant);
  if (!envelope) {
    void AsyncStorage.removeItem(key).catch(() => undefined);
    return { fetchedAt: 0, state: 'miss', value: null };
  }

  const age = Date.now() - envelope.fetchedAt;
  if (age > cachePolicies[resource].retainForMs) {
    void AsyncStorage.removeItem(key).catch(() => undefined);
    return { fetchedAt: 0, state: 'miss', value: null };
  }

  return {
    fetchedAt: envelope.fetchedAt,
    state: !envelope.dirty && age <= freshForMs ? 'fresh' : 'stale',
    value: envelope.value,
  };
}

async function pruneResource(ownerUserId: string, resource: CacheResource) {
  const policy = cachePolicies[resource];
  const prefix = resourcePrefix(ownerUserId, resource);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (!keys.length) return;

  const now = Date.now();
  const entries = await AsyncStorage.multiGet(keys);
  const retained: { key: string; lastAccessedAt: number }[] = [];
  const remove = new Set<string>();
  for (const [key, raw] of entries) {
    if (!raw) {
      remove.add(key);
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<CacheEnvelope<unknown>>;
      if (parsed.ownerUserId !== ownerUserId
        || parsed.resource !== resource
        || typeof parsed.fetchedAt !== 'number'
        || now - parsed.fetchedAt > policy.retainForMs) {
        remove.add(key);
        continue;
      }
      retained.push({
        key,
        lastAccessedAt: typeof parsed.lastAccessedAt === 'number' ? parsed.lastAccessedAt : parsed.fetchedAt,
      });
    } catch {
      remove.add(key);
    }
  }

  retained
    .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)
    .slice(policy.maxEntries)
    .forEach((entry) => remove.add(entry.key));
  if (remove.size) await AsyncStorage.multiRemove([...remove]);
}

export async function writeCache<T>(
  ownerUserId: string,
  resource: CacheResource,
  variant: string,
  value: T,
  options: { fetchedAt?: number; lease?: CacheLease } = {},
) {
  if (options.lease && !isCacheLeaseCurrent(options.lease)) return false;
  const now = Date.now();
  const envelope: CacheEnvelope<T> = {
    dirty: false,
    fetchedAt: options.fetchedAt ?? now,
    lastAccessedAt: now,
    ownerUserId,
    resource,
    schemaVersion: 1,
    value,
    variant,
  };
  const serialized = JSON.stringify(envelope);
  if (utf8ByteLength(serialized) > cachePolicies[resource].maxBytes) {
    console.warn(`Skipped an oversized ${resource} cache entry.`);
    return false;
  }
  if (options.lease && !isCacheLeaseCurrent(options.lease)) return false;
  await AsyncStorage.setItem(cacheStorageKey(ownerUserId, resource, variant), serialized);
  await pruneResource(ownerUserId, resource);
  return true;
}

export async function markCacheDirty(ownerUserId: string, resource: CacheResource) {
  const lease = currentCacheLease(ownerUserId);
  const prefix = resourcePrefix(ownerUserId, resource);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (!keys.length) return;
  const updates: [string, string][] = [];
  for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<CacheEnvelope<unknown>>;
      if (parsed.ownerUserId === ownerUserId && parsed.resource === resource) {
        updates.push([key, JSON.stringify({ ...parsed, dirty: true })]);
      }
    } catch {
      // Corrupt entries are removed below.
    }
  }
  if (updates.length && isCacheLeaseCurrent(lease)) await AsyncStorage.multiSet(updates);
}

export async function clearUserCache(ownerUserId: string) {
  const prefix = resourcePrefix(ownerUserId);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

export async function pruneUserCache(ownerUserId: string) {
  await Promise.all((Object.keys(cachePolicies) as CacheResource[]).map((resource) => (
    pruneResource(ownerUserId, resource)
  )));
}

export async function getUserCacheSize(ownerUserId: string) {
  const prefix = resourcePrefix(ownerUserId);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (!keys.length) return 0;
  return (await AsyncStorage.multiGet(keys)).reduce((bytes, [, value]) => (
    bytes + (value ? utf8ByteLength(value) : 0)
  ), 0);
}

const generations = new Map<string, number>();

export function currentCacheLease(ownerUserId: string): CacheLease {
  return { generation: generations.get(ownerUserId) ?? 0, ownerUserId };
}

export function isCacheLeaseCurrent(lease: CacheLease) {
  return (generations.get(lease.ownerUserId) ?? 0) === lease.generation;
}

export function invalidateCacheLease(ownerUserId: string) {
  generations.set(ownerUserId, (generations.get(ownerUserId) ?? 0) + 1);
}
