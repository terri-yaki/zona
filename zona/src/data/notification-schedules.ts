import { dataError } from '@/lib/errors';
import { translate } from '@/i18n';
import { supabase } from '@/lib/supabase';

export type NotificationSchedule = {
  enabled: boolean;
  endMinute: number;
  sourceId: string | null;
  startMinute: number;
  timezone: string;
  updatedAt: string | null;
  weekdays: number[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSchedule(value: unknown): NotificationSchedule {
  if (!record(value)) throw new Error('INVALID_NOTIFICATION_SCHEDULE');
  return {
    enabled: value.enabled === true,
    endMinute: typeof value.endMinute === 'number' ? value.endMinute : 480,
    sourceId: typeof value.sourceId === 'string' ? value.sourceId : null,
    startMinute: typeof value.startMinute === 'number' ? value.startMinute : 1320,
    timezone: typeof value.timezone === 'string' ? value.timezone : 'Asia/Hong_Kong',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    weekdays: Array.isArray(value.weekdays)
      ? value.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : [0, 1, 2, 3, 4, 5, 6],
  };
}

async function call(name: string, args: Record<string, unknown>) {
  const rpc = supabase.rpc as unknown as (
    rpcName: string,
    rpcArgs: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error) throw dataError(error, translate('schedule.loadError'));
  return parseSchedule(data);
}

export function getNotificationSchedule(sourceId: string | null) {
  return call('get_notification_schedule', { p_source_id: sourceId });
}

export function setNotificationSchedule(schedule: NotificationSchedule) {
  return call('set_notification_schedule', {
    p_enabled: schedule.enabled,
    p_end_minute: schedule.endMinute,
    p_source_id: schedule.sourceId,
    p_start_minute: schedule.startMinute,
    p_timezone: schedule.timezone,
    p_weekdays: schedule.weekdays,
  });
}

