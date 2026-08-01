import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';

export type NotificationSeverityFilter = 'low' | 'medium' | 'high' | 'critical' | null;

export type SavedInboxFilter = {
  createdAt: string;
  id: string;
  name: string;
  pinnedOnly: boolean;
  searchQuery: string;
  severity: NotificationSeverityFilter;
  sinceHours: number | null;
  sourceId: string | null;
  unreadOnly: boolean;
  updatedAt: string;
};

export type SavedInboxFilterInput = Omit<SavedInboxFilter, 'createdAt' | 'id' | 'updatedAt'>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFilter(value: unknown): SavedInboxFilter | null {
  if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  const severity = ['low', 'medium', 'high', 'critical'].includes(String(value.severity))
    ? value.severity as Exclude<NotificationSeverityFilter, null>
    : null;
  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    id: value.id,
    name: value.name,
    pinnedOnly: value.pinnedOnly === true,
    searchQuery: typeof value.searchQuery === 'string' ? value.searchQuery : '',
    severity,
    sinceHours: typeof value.sinceHours === 'number' ? value.sinceHours : null,
    sourceId: typeof value.sourceId === 'string' ? value.sourceId : null,
    unreadOnly: value.unreadOnly === true,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const rpc = supabase.rpc as unknown as (
    rpcName: string,
    rpcArgs?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error) throw dataError(error, translate('inbox.savedFilterError'));
  return data;
}

export async function listSavedInboxFilters() {
  const data = await call('list_saved_inbox_filters');
  return Array.isArray(data) ? data.flatMap((item) => parseFilter(item) ?? []) : [];
}

export async function saveInboxFilter(input: SavedInboxFilterInput, id: string | null = null) {
  const data = await call('save_inbox_filter', {
    p_filter_id: id,
    p_name: input.name,
    p_pinned_only: input.pinnedOnly,
    p_search: input.searchQuery,
    p_severity: input.severity,
    p_since_hours: input.sinceHours,
    p_source_id: input.sourceId,
    p_unread_only: input.unreadOnly,
  });
  const parsed = parseFilter(data);
  if (!parsed) throw dataError(null, translate('inbox.savedFilterError'));
  return parsed;
}

export async function deleteSavedInboxFilter(id: string) {
  const data = await call('delete_saved_inbox_filter', { p_filter_id: id });
  if (data !== true) throw dataError(null, translate('inbox.savedFilterError'));
}

