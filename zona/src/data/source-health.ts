import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';

export type SourceHealth = {
  alertsLast24Hours: number;
  delivered: number;
  deliverySuccessPercent: number | null;
  failed: number;
  lastAlertAt: string | null;
  lastAlertTitle: string | null;
  pending: number;
  sourceId: string;
  targeted: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parseHealth(value: unknown): SourceHealth | null {
  if (!record(value) || typeof value.sourceId !== 'string') return null;
  return {
    alertsLast24Hours: count(value.alertsLast24Hours),
    delivered: count(value.delivered),
    deliverySuccessPercent: typeof value.deliverySuccessPercent === 'number'
      ? Math.max(0, Math.min(100, value.deliverySuccessPercent))
      : null,
    failed: count(value.failed),
    lastAlertAt: typeof value.lastAlertAt === 'string' ? value.lastAlertAt : null,
    lastAlertTitle: typeof value.lastAlertTitle === 'string' ? value.lastAlertTitle : null,
    pending: count(value.pending),
    sourceId: value.sourceId,
    targeted: count(value.targeted),
  };
}

export async function getSourceHealth() {
  const rpc = supabase.rpc as unknown as (
    name: string,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data, error } = await rpc('get_source_health');
  if (error) throw dataError(error, translate('sources.healthLoadError'));
  return Array.isArray(data) ? data.flatMap((item) => parseHealth(item) ?? []) : [];
}

