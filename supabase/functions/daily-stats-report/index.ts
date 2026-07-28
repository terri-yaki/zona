import { sha256 } from '../_shared/crypto.ts';
import { json, readJson } from '../_shared/http.ts';
import { type DailyChartPoint, renderDailyStatsChart } from '../_shared/report-chart.ts';
import { elapsedMs, recordServerEvent } from '../_shared/server-telemetry.ts';
import { projectUrl, service } from '../_shared/supabase.ts';

type StoredStat = {
  date?: unknown;
  metrics?: unknown;
};

type NotifyResponse = {
  notificationId?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (isRecord(error) && typeof error.message === 'string') return error.message.slice(0, 500);
  return 'UNKNOWN';
}

function count(metrics: Record<string, unknown>, key: string): number {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function reportDate(value: unknown): string {
  const fallback = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_REPORT_DATE');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || value > new Date().toISOString().slice(0, 10)) throw new Error('INVALID_REPORT_DATE');
  return value;
}

async function authorized(req: Request): Promise<boolean> {
  const expected = Deno.env.get('DAILY_REPORT_SECRET');
  const provided = req.headers.get('x-daily-report-secret');
  if (!expected || !provided) return false;
  const [expectedHash, providedHash] = await Promise.all([sha256(expected), sha256(provided)]);
  return expectedHash === providedHash;
}

function chartPoints(value: unknown): DailyChartPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const row = candidate as StoredStat;
    if (typeof row.date !== 'string' || !isRecord(row.metrics)) return [];
    return [{
      date: row.date,
      notifications: count(row.metrics, 'notificationsAccepted'),
      pushAccepted: count(row.metrics, 'pushAccepted'),
      errors: count(row.metrics, 'clientErrors') + count(row.metrics, 'serverErrors') + count(row.metrics, 'pushFailed'),
    }];
  });
}

function bodyFor(date: string, metrics: Record<string, unknown>): string {
  const accepted = count(metrics, 'notificationsAccepted');
  const attempted = count(metrics, 'pushAttempted');
  const pushed = count(metrics, 'pushAccepted');
  const errors = count(metrics, 'clientErrors') + count(metrics, 'serverErrors');
  const rate = attempted > 0 ? `${Math.round((pushed / attempted) * 100)}%` : '—';
  return [
    `${accepted} alerts accepted · ${pushed}/${attempted} pushes accepted (${rate}).`,
    `${count(metrics, 'activeUsers')} active users · ${count(metrics, 'activeSources')} active sources.`,
    `${errors} client/server errors · ${count(metrics, 'pushFailed')} push failures.`,
  ].join('\n');
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!await authorized(req)) return json({ error: 'UNAUTHORIZED' }, 401);

  let date = '';
  try {
    const body = await readJson(req, 1_024);
    date = reportDate(body.date);

    const { data: metricsValue, error: refreshError } = await service.rpc('refresh_daily_usage_stats_internal', {
      p_stat_date: date,
    });
    if (refreshError || !isRecord(metricsValue)) throw refreshError ?? new Error('INVALID_STATS');
    const metrics = metricsValue;

    const { data: shouldSend, error: startError } = await service.rpc('start_daily_report_internal', {
      p_report_date: date,
      p_metrics: metrics,
    });
    if (startError) throw startError;
    if (shouldSend !== true) return json({ reportDate: date, alreadySent: true }, 200, { 'Cache-Control': 'no-store' });

    const { data: history, error: historyError } = await service.rpc('list_service_daily_usage_stats_internal', {
      p_days: 7,
    });
    if (historyError) throw historyError;
    const chart = await renderDailyStatsChart(chartPoints(history));

    const token = Deno.env.get('ZONA_REPORT_TOKEN');
    if (!token) throw new Error('MISSING_ZONA_REPORT_TOKEN');
    const form = new FormData();
    form.set('title', `Zona daily pulse · ${date}`);
    form.set('body', bodyFor(date, metrics));
    form.set('category', 'zona-operations');
    form.set('severity', count(metrics, 'serverErrors') + count(metrics, 'pushFailed') > 0 ? 'medium' : 'low');
    form.set('data', JSON.stringify({ reportDate: date, reportType: 'daily-operations' }));
    form.set('attachment', new File([new Uint8Array(chart).buffer], `zona-daily-${date}.png`, { type: 'image/png' }));

    const response = await fetch(`${projectUrl()}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': `daily-stats-${date}`,
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const notifyResult = await response.json().catch(() => null) as NotifyResponse | null;
    const notificationId = typeof notifyResult?.notificationId === 'string' ? notifyResult.notificationId : null;
    if (!response.ok || !notificationId) throw new Error(`REPORT_NOTIFY_${response.status}`);

    const { error: finishError } = await service.rpc('finish_daily_report_internal', {
      p_report_date: date,
      p_status: 'sent',
      p_notification_id: notificationId,
      p_error_message: null,
    });
    if (finishError) throw finishError;

    await recordServerEvent({
      requestId,
      component: 'daily-stats-report',
      eventName: 'report.sent',
      statusCode: 200,
      durationMs: elapsedMs(startedAt),
      notificationId,
      context: { reportDate: date, chartDays: chartPoints(history).length },
    });
    return json({ reportDate: date, notificationId, sent: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const message = errorMessage(error);
    if (date) {
      try {
        await service.rpc('finish_daily_report_internal', {
          p_report_date: date,
          p_status: 'failed',
          p_notification_id: null,
          p_error_message: message,
        });
      } catch {
        // The original failure is more useful than a secondary ledger error.
      }
    }
    await recordServerEvent({
      requestId,
      component: 'daily-stats-report',
      eventName: 'report.failed',
      level: 'error',
      statusCode: 500,
      durationMs: elapsedMs(startedAt),
      message,
      context: date ? { reportDate: date } : {},
    });
    if (message === 'INVALID_REPORT_DATE') return json({ error: message }, 400);
    console.error('daily-stats-report', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
