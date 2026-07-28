import { service } from './supabase.ts';

export type ServerEvent = {
  requestId?: string | null;
  component: string;
  eventName: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  userId?: string | null;
  sourceId?: string | null;
  notificationId?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  message?: string | null;
  context?: Record<string, unknown>;
};

/** Best-effort structured logging. Telemetry must never break the request. */
export async function recordServerEvent(event: ServerEvent): Promise<void> {
  try {
    const { error } = await service.rpc('record_server_event_internal', {
      p_request_id: event.requestId ?? null,
      p_component: event.component,
      p_event_name: event.eventName,
      p_level: event.level ?? 'info',
      p_user_id: event.userId ?? null,
      p_source_id: event.sourceId ?? null,
      p_notification_id: event.notificationId ?? null,
      p_status_code: event.statusCode ?? null,
      p_duration_ms: event.durationMs ?? null,
      p_message: event.message?.slice(0, 500) ?? null,
      p_context: event.context ?? {},
    });
    if (error) console.error('structured server log failed', error);
  } catch (error) {
    console.error('structured server log unavailable', error);
  }
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
