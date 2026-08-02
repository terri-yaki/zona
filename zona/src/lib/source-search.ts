type SearchableSource = {
  display_name: string;
  hostname: string | null;
  api_key: { name: string; key_prefix: string | null } | null;
};

export function filterSources<T extends SearchableSource>(sources: readonly T[], rawQuery: string): T[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [...sources];
  return sources.filter((source) => [
    source.display_name,
    source.hostname ?? '',
    source.api_key?.name ?? '',
    source.api_key?.key_prefix ?? '',
  ].some((value) => value.toLocaleLowerCase().includes(query)));
}
