export const EXPO_PUSH_BATCH_SIZE = 100;
export const MAX_EXPO_MESSAGE_BYTES = 3_800;

export type PushMetadata = Record<string, unknown>;

export type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

export type PushBehavior = {
  soundName: string | null;
  showPreview: boolean;
};

const allowedSounds = new Set([
  'default',
  'zona-soft.wav',
  'zona-bright.wav',
  'zona-urgent.wav',
  'zona-chime.wav',
  'zona-crystal.wav',
  'zona-warm.wav',
  'zona-pulse.wav',
  'zona-signal.wav',
  'zona-bloom.wav',
]);

export function resolveSound(playSound: boolean, soundName: string | null | undefined): string | null {
  if (!playSound || soundName === 'silent') return null;
  return soundName && allowedSounds.has(soundName) ? soundName : 'default';
}

export function chunk<T>(values: T[], size = EXPO_PUSH_BATCH_SIZE): T[][] {
  if (!Number.isSafeInteger(size) || size < 1 || size > EXPO_PUSH_BATCH_SIZE) {
    throw new Error('INVALID_BATCH_SIZE');
  }
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function createPushMessage(
  to: string,
  title: string,
  body: string,
  sourceName: string,
  notificationId: string,
  sourceId: string,
  behavior: PushBehavior = { soundName: 'default', showPreview: true },
) {
  return {
    to,
    ...(behavior.soundName ? { sound: behavior.soundName } : {}),
    title: behavior.showPreview ? title : 'New Zona alert',
    subtitle: behavior.showPreview ? `From ${sourceName}` : 'Zona',
    body: behavior.showPreview ? body : 'Open Zona to view this notification.',
    ttl: 3_600,
    data: { notificationId, sourceId },
  };
}

export function assertPushPayloadFits(title: string, body: string): void {
  // The source name is not known until the authenticated RPC resolves. Probe
  // with the maximum possible UTF-8 source name and normal identifier sizes so
  // every payload accepted here remains below Expo/APNs' 4 KiB total limit.
  const maximumSourceName = '💻'.repeat(80);
  const probe = createPushMessage(
    `ExpoPushToken[${'x'.repeat(64)}]`,
    title,
    body,
    maximumSourceName,
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000000',
  );
  if (byteLength(probe) > MAX_EXPO_MESSAGE_BYTES) throw new Error('INVALID_PAYLOAD');
}

export function ticketError(ticket: ExpoTicket | null | undefined, responseOk: boolean): string | null {
  if (!responseOk) return 'EXPO_REQUEST_FAILED';
  if (!ticket || ticket.status !== 'ok') {
    return ticket?.details?.error ?? ticket?.message ?? 'EXPO_TICKET_ERROR';
  }
  return null;
}
