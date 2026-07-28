export type CacheResource = 'changelog' | 'inbox' | 'preferences' | 'runtime' | 'sources';

export type CacheEnvelope<T> = {
  dirty: boolean;
  fetchedAt: number;
  lastAccessedAt: number;
  ownerUserId: string;
  resource: CacheResource;
  schemaVersion: 1;
  value: T;
  variant: string;
};

export type CacheRead<T> = {
  fetchedAt: number;
  state: 'fresh' | 'miss' | 'stale';
  value: T | null;
};

export type CacheLease = {
  generation: number;
  ownerUserId: string;
};
