import { describe, expect, it } from 'vitest';

import { sortSourcesForFilters } from '../lib/source-filters';
import type { Source } from '../types';

function source(id: string, displayName: string, revokedAt: string | null = null): Source {
  return {
    id,
    user_id: 'user-1',
    display_name: displayName,
    hostname: null,
    created_at: '2026-08-01T00:00:00Z',
    last_seen_at: null,
    revoked_at: revokedAt,
    api_key: null,
  };
}

describe('sortSourcesForFilters', () => {
  it('places revoked sources after active ones', () => {
    const sources = [
      source('a', 'Alpha', '2026-08-02T00:00:00Z'),
      source('b', 'Beta', null),
      source('c', 'Charlie', '2026-08-01T00:00:00Z'),
      source('d', 'Delta', null),
    ];
    expect(sortSourcesForFilters(sources, 'en').map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('sorts each partition alphabetically by display name', () => {
    const sources = [
      source('z', 'Zebra', null),
      source('a', 'Ant', null),
      source('m', 'Moth', '2026-08-01T00:00:00Z'),
      source('b', 'Bee', '2026-08-01T00:00:00Z'),
    ];
    expect(sortSourcesForFilters(sources, 'en').map((s) => s.id)).toEqual(['a', 'z', 'b', 'm']);
  });

  it('respects the locale tag for alphabetical ordering', () => {
    const sources = [
      source('z', 'z', null),
      source('aa', 'äa', null),
      source('a', 'a', null),
    ];
    const de = sortSourcesForFilters(sources, 'de');
    expect(de.map((s) => s.id)).toEqual(['a', 'aa', 'z']);
  });

  it('returns an empty array for no sources', () => {
    expect(sortSourcesForFilters([], 'en')).toEqual([]);
  });

  it('keeps the order stable when every source is revoked', () => {
    const sources = [
      source('z', 'Zebra', '2026-08-01T00:00:00Z'),
      source('a', 'Ant', '2026-08-01T00:00:00Z'),
      source('m', 'Moth', '2026-08-01T00:00:00Z'),
    ];
    expect(sortSourcesForFilters(sources, 'en').map((s) => s.id)).toEqual(['a', 'm', 'z']);
  });

  it('keeps the order stable when no source is revoked', () => {
    const sources = [
      source('c', 'Charlie'),
      source('a', 'Alpha'),
      source('b', 'Bravo'),
    ];
    expect(sortSourcesForFilters(sources, 'en').map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
