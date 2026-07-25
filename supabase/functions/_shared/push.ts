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

/**
 * Bundled iPhone alert tones selectable in the app. Mirrors
 * `zona/src/lib/notification-sound-map.ts` (IOS_TONE_FILES) — keep both sides
 * in sync; unit tests on each side pin the same channel ids.
 */
const iosToneFiles = [
  'ios-alarm.wav',
  'ios-apex.wav',
  'ios-ascending.wav',
  'ios-aurora.wav',
  'ios-bamboo.wav',
  'ios-bark.wav',
  'ios-beacon.wav',
  'ios-bell-tower.wav',
  'ios-blues.wav',
  'ios-boing.wav',
  'ios-bulletin.wav',
  'ios-by-the-seaside.wav',
  'ios-chimes.wav',
  'ios-chord.wav',
  'ios-circles.wav',
  'ios-circuit.wav',
  'ios-complete.wav',
  'ios-constellation.wav',
  'ios-cosmic.wav',
  'ios-crickets.wav',
  'ios-crystals.wav',
  'ios-digital.wav',
  'ios-doorbell.wav',
  'ios-duck.wav',
  'ios-glass.wav',
  'ios-harp.wav',
  'ios-hello.wav',
  'ios-hillside.wav',
  'ios-illuminate.wav',
  'ios-input.wav',
  'ios-keys.wav',
  'ios-marimba.wav',
  'ios-motorcycle.wav',
  'ios-night-owl.wav',
  'ios-note.wav',
  'ios-old-car-horn.wav',
  'ios-old-phone.wav',
  'ios-opening.wav',
  'ios-piano-riff.wav',
  'ios-pinball.wav',
  'ios-playtime.wav',
  'ios-popcorn.wav',
  'ios-presto.wav',
  'ios-pulse.wav',
  'ios-radar.wav',
  'ios-radiate.wav',
  'ios-reflection.wav',
  'ios-ripples.wav',
  'ios-robot.wav',
  'ios-sci-fi.wav',
  'ios-sencha.wav',
  'ios-signal.wav',
  'ios-silk.wav',
  'ios-slow-rise.wav',
  'ios-sonar.wav',
  'ios-stargaze.wav',
  'ios-strum.wav',
  'ios-summit.wav',
  'ios-synth.wav',
  'ios-timba.wav',
  'ios-time-passing.wav',
  'ios-trill.wav',
  'ios-twinkle.wav',
  'ios-uplift.wav',
  'ios-waves.wav',
  'ios-xylophone.wav',
];

const allowedSounds = new Set([
  'default',
  ...iosToneFiles,
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

/** Android notification channel id for a sound choice (matches the app-side mapping). */
export function soundChannelId(soundName: string | null): string {
  if (!soundName) return 'zona_silent';
  if (soundName === 'default') return 'zona_default';
  // zona-soft.wav → zona_soft; ios-aurora.wav → zona_ios_aurora
  const slug = soundName.replace(/\.wav$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return slug.startsWith('zona_') ? slug : `zona_${slug}`;
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
  // Expo → APNs: `sound` must be the bundled basename including extension
  // (e.g. zona-soft.wav, ios-aurora.wav) or `default`. Missing files make iOS
  // fall back to the system default.
  const sound = behavior.soundName;
  return {
    to,
    priority: 'high',
    channelId: soundChannelId(sound),
    ...(sound ? { sound } : { sound: null }),
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
