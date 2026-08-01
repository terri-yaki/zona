import { sha256 } from '../_shared/crypto.ts';
import { json } from '../_shared/http.ts';
import { classifyExpoFailure, receiptError, requestFailure } from '../_shared/push-delivery.ts';
import {
  byteLength,
  createPushMessage,
  MAX_EXPO_MESSAGE_BYTES,
  resolveDeviceChannelId,
  resolveDeviceSound,
  resolveSound,
} from '../_shared/push.ts';
import { type NotificationSeverity, severityColor } from '../_shared/severity.ts';
import { service } from '../_shared/supabase.ts';

type DeliveryJob = {
  job_id: string;
  notification_id: string;
  owner_user_id: string;
  push_device_id: string;
  expo_push_token: string;
  platform: 'ios' | 'android';
  title: string;
  body: string;
  source_name: string;
  source_id: string;
  severity: NotificationSeverity | null;
  show_preview: boolean;
  sound_name: string;
};

type ReceiptJob = { job_id: string; expo_ticket_id: string };
type ExpoTicket = { status?: unknown; id?: unknown; details?: { error?: unknown } };

const sendEndpoint = 'https://exp.host/--/api/v2/push/send';
const receiptEndpoint = 'https://exp.host/--/api/v2/push/getReceipts';

async function authorized(req: Request) {
  const expected = Deno.env.get('PUSH_WORKER_SECRET');
  const provided = req.headers.get('x-push-worker-secret');
  if (!expected || !provided) return false;
  const [expectedHash, providedHash] = await Promise.all([sha256(expected), sha256(provided)]);
  return expectedHash === providedHash;
}

function expoHeaders() {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function failSend(job: DeliveryJob, workerId: string, code: string, permanent: boolean, httpStatus?: number) {
  const { error } = await service.rpc('fail_push_delivery_job_internal', {
    p_job_id: job.job_id,
    p_worker_id: workerId,
    p_error_code: code,
    p_permanent: permanent,
    p_http_status: httpStatus ?? null,
  });
  if (error) throw error;
}

async function processSends(workerId: string) {
  const { data, error } = await service.rpc('claim_push_delivery_jobs_internal', {
    p_worker_id: workerId,
    p_limit: 100,
  });
  if (error) throw error;
  const jobs = (data ?? []) as DeliveryJob[];
  if (!jobs.length) return { claimed: 0, tickets: 0, failed: 0 };

  const valid: { job: DeliveryJob; message: ReturnType<typeof createPushMessage> }[] = [];
  let failed = 0;
  const preFailOutcomes: Record<string, unknown>[] = [];
  for (const job of jobs) {
    // SQL collapses play_sound=false (and source silent) to sound_name='silent'.
    // resolveSound maps that to null so muted alerts stay quiet on both platforms.
    const sound = resolveDeviceSound(job.platform, resolveSound(true, job.sound_name));
    const message = createPushMessage(
      job.expo_push_token,
      job.title,
      job.body,
      job.source_name,
      job.notification_id,
      job.source_id,
      {
        channelId: resolveDeviceChannelId(job.platform, job.source_id, sound),
        color: job.platform === 'android' ? severityColor(job.severity) : undefined,
        severity: job.severity,
        soundName: sound,
        showPreview: job.show_preview,
      },
    );
    if (byteLength(message) > MAX_EXPO_MESSAGE_BYTES) {
      preFailOutcomes.push({
        kind: 'fail',
        jobId: job.job_id,
        errorCode: 'MESSAGE_TOO_BIG',
        permanent: true,
      });
      failed += 1;
    } else valid.push({ job, message });
  }

  if (preFailOutcomes.length) {
    const { error: preFailError } = await service.rpc('apply_push_send_outcomes_internal', {
      p_worker_id: workerId,
      p_outcomes: preFailOutcomes,
    });
    if (preFailError) {
      // Fallback if batch RPC is not deployed yet.
      await Promise.all(preFailOutcomes.map((entry) =>
        failSend(
          jobs.find((job) => job.job_id === entry.jobId)!,
          workerId,
          String(entry.errorCode),
          true,
        )
      ));
    }
  }

  if (!valid.length) return { claimed: jobs.length, tickets: 0, failed };
  try {
    const response = await fetch(sendEndpoint, {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify(valid.map((entry) => entry.message)),
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody: unknown = await response.json().catch(() => null);
    const raw = responseBody && typeof responseBody === 'object' && 'data' in responseBody
      ? (responseBody as { data?: unknown }).data
      : null;
    const tickets = Array.isArray(raw) ? raw as ExpoTicket[] : raw && typeof raw === 'object' ? [raw as ExpoTicket] : [];
    const outcomes: Record<string, unknown>[] = [];
    for (let index = 0; index < valid.length; index += 1) {
      const entry = valid[index];
      const ticket = tickets[index];
      if (response.ok && ticket?.status === 'ok' && typeof ticket.id === 'string') {
        outcomes.push({
          kind: 'accept',
          jobId: entry.job.job_id,
          ticketId: ticket.id,
          httpStatus: response.status,
        });
      } else {
        const classified = classifyExpoFailure(ticket?.details?.error, response.status);
        outcomes.push({
          kind: 'fail',
          jobId: entry.job.job_id,
          errorCode: classified.code,
          permanent: classified.permanent,
          httpStatus: response.status,
        });
      }
    }

    const { data: batchResult, error: batchError } = await service.rpc('apply_push_send_outcomes_internal', {
      p_worker_id: workerId,
      p_outcomes: outcomes,
    });
    if (batchError) {
      // Fallback path: per-job RPCs when batch helper is unavailable.
      const fallback = await Promise.all(outcomes.map(async (outcome) => {
        if (outcome.kind === 'accept') {
          const { data: ticketApplied, error: ticketError } = await service.rpc('accept_push_delivery_ticket_internal', {
            p_job_id: outcome.jobId,
            p_worker_id: workerId,
            p_ticket_id: outcome.ticketId,
            p_http_status: outcome.httpStatus ?? null,
          });
          if (ticketError) throw ticketError;
          // Lease/status race: the accept was not applied — count it as skipped,
          // not accepted, so the mismatch is visible instead of silent.
          if (ticketApplied === false) return { accepted: 0, failed: 0, skipped: 1 };
          return { accepted: 1, failed: 0 };
        }
        const job = valid.find((entry) => entry.job.job_id === outcome.jobId)?.job;
        if (!job) return { accepted: 0, failed: 0 };
        await failSend(
          job,
          workerId,
          String(outcome.errorCode),
          Boolean(outcome.permanent),
          typeof outcome.httpStatus === 'number' ? outcome.httpStatus : undefined,
        );
        return { accepted: 0, failed: 1 };
      }));
      const accepted = fallback.reduce((sum, row) => sum + row.accepted, 0);
      failed += fallback.reduce((sum, row) => sum + row.failed, 0);
      const skipped = fallback.reduce((sum, row) => sum + (row.skipped ?? 0), 0);
      return { claimed: jobs.length, tickets: accepted, failed, skipped };
    }

    const accepted = typeof batchResult?.accepted === 'number'
      ? batchResult.accepted
      : outcomes.filter((row) => row.kind === 'accept').length;
    failed += typeof batchResult?.failed === 'number' ? batchResult.failed : outcomes.filter((row) => row.kind === 'fail').length;
    return { claimed: jobs.length, tickets: accepted, failed };
  } catch (sendError) {
    console.error('push send batch deferred', sendError);
    const classified = requestFailure(sendError);
    const outcomes = valid.map(({ job }) => ({
      kind: 'fail',
      jobId: job.job_id,
      errorCode: classified.code,
      permanent: false,
    }));
    const { error: batchError } = await service.rpc('apply_push_send_outcomes_internal', {
      p_worker_id: workerId,
      p_outcomes: outcomes,
    });
    if (batchError) {
      await Promise.all(valid.map(({ job }) => failSend(job, workerId, classified.code, false)));
    }
    return { claimed: jobs.length, tickets: 0, failed: failed + valid.length };
  }
}

async function processReceipts(workerId: string) {
  const { data, error } = await service.rpc('claim_push_receipt_jobs_internal', {
    p_worker_id: workerId,
    p_limit: 100,
  });
  if (error) throw error;
  const jobs = (data ?? []) as ReceiptJob[];
  if (!jobs.length) return { claimed: 0, delivered: 0, deferred: 0, failed: 0 };

  try {
    const response = await fetch(receiptEndpoint, {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify({ ids: jobs.map((job) => job.expo_ticket_id) }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: unknown = await response.json().catch(() => null);
    const receipts = body && typeof body === 'object' && 'data' in body &&
        (body as { data?: unknown }).data && typeof (body as { data?: unknown }).data === 'object'
      ? (body as { data: Record<string, unknown> }).data
      : {};
    const outcomes: Record<string, unknown>[] = [];
    for (const job of jobs) {
      const parsed = receiptError(receipts[job.expo_ticket_id]);
      if (response.ok && parsed?.delivered) {
        outcomes.push({
          kind: 'complete',
          jobId: job.job_id,
          outcome: 'delivered',
          httpStatus: response.status,
        });
      } else if (response.ok && parsed && !parsed.delivered && parsed.permanent) {
        outcomes.push({
          kind: 'complete',
          jobId: job.job_id,
          outcome: 'permanent_failed',
          errorCode: parsed.code,
          httpStatus: response.status,
        });
      } else if (response.ok && parsed && !parsed.delivered && !parsed.permanent) {
        outcomes.push({
          kind: 'retry',
          jobId: job.job_id,
          errorCode: parsed.code,
          httpStatus: response.status,
        });
      } else if (response.ok && parsed && !parsed.delivered) {
        outcomes.push({
          kind: 'complete',
          jobId: job.job_id,
          outcome: 'permanent_failed',
          errorCode: 'UNKNOWN_EXPO_ERROR',
          httpStatus: response.status,
        });
      } else {
        outcomes.push({
          kind: 'defer',
          jobId: job.job_id,
          errorCode: response.ok ? 'RECEIPT_PENDING' : 'RECEIPT_UNAVAILABLE',
          httpStatus: response.status,
        });
      }
    }

    const { data: batchResult, error: batchError } = await service.rpc('apply_push_receipt_outcomes_internal', {
      p_worker_id: workerId,
      p_outcomes: outcomes,
    });
    if (batchError) {
      const fallback = await Promise.all(outcomes.map(async (outcome) => {
        if (outcome.kind === 'complete') {
          const { error: completeError } = await service.rpc('complete_push_delivery_job_internal', {
            p_job_id: outcome.jobId,
            p_worker_id: workerId,
            p_outcome: outcome.outcome,
            p_error_code: outcome.errorCode ?? null,
            p_http_status: outcome.httpStatus ?? null,
          });
          if (completeError) throw completeError;
          return {
            delivered: outcome.outcome === 'delivered' ? 1 : 0,
            deferred: 0,
            failed: outcome.outcome === 'delivered' ? 0 : 1,
          };
        }
        if (outcome.kind === 'retry') {
          const { error: retryError } = await service.rpc('retry_push_delivery_from_receipt_internal', {
            p_job_id: outcome.jobId,
            p_worker_id: workerId,
            p_error_code: outcome.errorCode,
            p_http_status: outcome.httpStatus ?? null,
          });
          if (retryError) throw retryError;
          return { delivered: 0, deferred: 1, failed: 0 };
        }
        const { error: deferError } = await service.rpc('defer_push_receipt_internal', {
          p_job_id: outcome.jobId,
          p_worker_id: workerId,
          p_error_code: outcome.errorCode,
          p_http_status: outcome.httpStatus ?? null,
        });
        if (deferError) throw deferError;
        return { delivered: 0, deferred: 1, failed: 0 };
      }));
      return {
        claimed: jobs.length,
        delivered: fallback.reduce((sum, row) => sum + row.delivered, 0),
        deferred: fallback.reduce((sum, row) => sum + row.deferred, 0),
        failed: fallback.reduce((sum, row) => sum + row.failed, 0),
      };
    }

    return {
      claimed: jobs.length,
      delivered: typeof batchResult?.delivered === 'number' ? batchResult.delivered : 0,
      deferred: typeof batchResult?.deferred === 'number' ? batchResult.deferred : 0,
      failed: typeof batchResult?.failed === 'number' ? batchResult.failed : 0,
    };
  } catch (receiptFailure) {
    console.error('push receipt batch deferred', receiptFailure);
    const outcomes = jobs.map((job) => ({
      kind: 'defer',
      jobId: job.job_id,
      errorCode: 'RECEIPT_UNAVAILABLE',
    }));
    const { error: batchError } = await service.rpc('apply_push_receipt_outcomes_internal', {
      p_worker_id: workerId,
      p_outcomes: outcomes,
    });
    let deferredCount = jobs.length;
    if (batchError) {
      const deferred = await Promise.all(jobs.map((job) =>
        service.rpc('defer_push_receipt_internal', {
          p_job_id: job.job_id,
          p_worker_id: workerId,
          p_error_code: 'RECEIPT_UNAVAILABLE',
          p_http_status: null,
        })
      ));
      deferredCount = 0;
      for (const result of deferred) {
        if (result.error) console.error('push receipt defer failed', result.error);
        else deferredCount += 1;
      }
    }
    // Report only successful defers so stuck jobs are visible instead of silent.
    return { claimed: jobs.length, delivered: 0, deferred: deferredCount, failed: jobs.length - deferredCount };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!await authorized(req)) return json({ error: 'UNAUTHORIZED' }, 401);
  try {
    const workerId = crypto.randomUUID();
    const [sends, receipts] = await Promise.all([processSends(workerId), processReceipts(workerId)]);
    return json({ sends, receipts }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('push-delivery-worker', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
