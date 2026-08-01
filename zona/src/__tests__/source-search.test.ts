import { describe, expect, it } from 'vitest';

import { filterSources } from '../lib/source-search';

const sources = [
  { id: 'one', display_name: 'Build Agent', hostname: 'CI-01', api_key: { name: 'Release key', key_prefix: 'zona_live_ABC' } },
  { id: 'two', display_name: 'Office PC', hostname: null, api_key: { name: 'Desktop script', key_prefix: 'zona_live_XYZ' } },
];

describe('filterSources', () => {
  it.each([
    ['build', 'one'],
    ['ci-01', 'one'],
    ['release key', 'one'],
    ['xyz', 'two'],
    ['OFFICE', 'two'],
  ])('finds %s across user-visible source fields', (query, expectedId) => {
    expect(filterSources(sources, query).map((source) => source.id)).toEqual([expectedId]);
  });

  it('returns every source for a blank query', () => {
    expect(filterSources(sources, '  ')).toHaveLength(2);
  });
});
