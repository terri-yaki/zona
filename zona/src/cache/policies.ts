import type { CacheResource } from './types';

export type CachePolicy = {
  freshForMs: number;
  maxBytes: number;
  maxEntries: number;
  retainForMs: number;
};

const day = 24 * 60 * 60 * 1000;

export const cachePolicies: Record<CacheResource, CachePolicy> = {
  inbox: {
    freshForMs: 15_000,
    maxBytes: 768 * 1024,
    maxEntries: 12,
    retainForMs: 30 * day,
  },
  sources: {
    freshForMs: 60_000,
    maxBytes: 256 * 1024,
    maxEntries: 2,
    retainForMs: 30 * day,
  },
  preferences: {
    freshForMs: 5 * 60_000,
    maxBytes: 16 * 1024,
    maxEntries: 1,
    retainForMs: 30 * day,
  },
  changelog: {
    freshForMs: 6 * 60 * 60_000,
    maxBytes: 256 * 1024,
    maxEntries: 3,
    retainForMs: 30 * day,
  },
  runtime: {
    freshForMs: 5 * 60_000,
    maxBytes: 128 * 1024,
    maxEntries: 8,
    retainForMs: day,
  },
};
