import type { Source } from '@/types';

/**
 * Order source filter chips so active sources appear first, then revoked
 * sources, each group sorted alphabetically by display name using the user's
 * locale. This keeps the most useful chips reachable and never lets revoked
 * sources displace active ones when the row is capped.
 */
export function sortSourcesForFilters(sources: Source[], localeTag: string): Source[] {
  const actives: Source[] = [];
  const revoked: Source[] = [];
  for (const source of sources) {
    if (source.revoked_at) revoked.push(source);
    else actives.push(source);
  }
  actives.sort((left, right) => left.display_name.localeCompare(right.display_name, localeTag));
  revoked.sort((left, right) => left.display_name.localeCompare(right.display_name, localeTag));
  return [...actives, ...revoked];
}
