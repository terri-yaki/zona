import {
  clearUserCache,
  invalidateCacheLease,
} from './store';

type CacheResetter = (ownerUserId: string) => void;

const resetters = new Set<CacheResetter>();

export function registerCacheResetter(resetter: CacheResetter) {
  resetters.add(resetter);
  return () => resetters.delete(resetter);
}

export async function clearCachedContent(ownerUserId: string) {
  invalidateCacheLease(ownerUserId);
  for (const reset of resetters) reset(ownerUserId);
  await clearUserCache(ownerUserId);
}
