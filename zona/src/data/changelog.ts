import { Platform } from 'react-native';

import { parseChangelogRows, type ChangelogRow } from '@/lib/changelog';
import { supabase } from '@/lib/supabase';

/**
 * Server-driven What's New content from the normalized release tables.
 * Returns null only when the backend is unavailable; an empty array is an
 * authoritative operator choice and must not resurrect bundled releases.
 */
export async function fetchChangelogRows(): Promise<ChangelogRow[] | null> {
  const { data, error } = await supabase
    .from('app_release_notes')
    .select('id, version, released_at, title_en, title_zh_hant, summary_en, summary_zh_hant, app_release_note_items(id, item_key, icon_name, title_en, title_zh_hant, body_en, body_zh_hant, position, is_active, platform)')
    .eq('is_active', true)
    .order('released_at', { ascending: false });
  if (error) {
    console.warn('Could not load the server changelog; using the bundled copy.', error);
    return null;
  }
  const compatibleRows = (data ?? []).map((row) => ({
    ...row,
    items: [...row.app_release_note_items]
      .filter((item) => item.platform === null || item.platform === Platform.OS)
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        key: item.item_key,
        icon: item.icon_name,
        title_en: item.title_en,
        title_zh_hant: item.title_zh_hant,
        body_en: item.body_en,
        body_zh_hant: item.body_zh_hant,
        is_active: item.is_active,
      })),
  }));
  return parseChangelogRows(compatibleRows);
}
