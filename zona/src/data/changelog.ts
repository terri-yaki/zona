import { parseChangelogRows, type ChangelogRow } from '@/lib/changelog';
import { supabase } from '@/lib/supabase';

/**
 * Server-driven What's New content from `public.app_changelog`. Returns null
 * when the table is unreachable or empty — callers fall back to the bundled
 * copy, so the screen works on backends that have not applied the migration.
 */
export async function fetchChangelogRows(): Promise<ChangelogRow[] | null> {
  const { data, error } = await supabase
    .from('app_changelog')
    .select('id, version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, items')
    .order('released_at', { ascending: false });
  if (error) {
    console.warn('Could not load the server changelog; using the bundled copy.', error);
    return null;
  }
  const rows = parseChangelogRows(data);
  return rows.length > 0 ? rows : null;
}
