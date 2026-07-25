import { assertEquals, assertThrows } from '@std/assert';

import {
  assertPushPayloadFits,
  byteLength,
  chunk,
  createPushMessage,
  MAX_EXPO_MESSAGE_BYTES,
  pushPayloadSound,
  resolveSound,
  soundChannelId,
  ticketError,
} from './push.ts';

Deno.test('push batches never exceed the Expo request limit', () => {
  const batches = chunk(Array.from({ length: 201 }, (_, index) => index));
  assertEquals(batches.map((batch) => batch.length), [100, 100, 1]);
  assertThrows(() => chunk([1], 101));
});

Deno.test('payload guard counts encoded Unicode JSON bytes', () => {
  assertPushPayloadFits('Build complete', 'A short result');
  assertThrows(() => assertPushPayloadFits('Large', '💻'.repeat(1_000)));

  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Title',
    'Body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000000',
  );
  assertEquals(byteLength(message) < MAX_EXPO_MESSAGE_BYTES, true);
});

Deno.test('push data exposes only reserved routing identifiers', () => {
  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Title',
    'Body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
  );
  assertEquals(message.data, {
    notificationId: '00000000-0000-4000-8000-000000000000',
    sourceId: '00000000-0000-4000-8000-000000000001',
  });
});

Deno.test('push behavior can hide previews and disable sound', () => {
  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Private title',
    'Private body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    { soundName: null, showPreview: false },
  );
  assertEquals(message.title, 'New Zona alert');
  assertEquals(message.body, 'Open Zona to view this notification.');
  assertEquals(message.sound, null);
  assertEquals(message.channelId, 'zona_silent');
});

Deno.test('per-source sounds are allowlisted and respect the global setting', () => {
  assertEquals(resolveSound(true, 'zona-soft.wav'), 'zona-soft.wav');
  assertEquals(resolveSound(true, 'zona-chime.wav'), 'zona-chime.wav');
  assertEquals(resolveSound(true, 'zona-bloom.wav'), 'zona-bloom.wav');
  assertEquals(resolveSound(true, 'not-bundled.wav'), 'default');
  assertEquals(resolveSound(true, 'silent'), null);
  assertEquals(resolveSound(false, 'zona-urgent.wav'), null);

  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Title',
    'Body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    { soundName: 'zona-bright.wav', showPreview: true },
  );
  assertEquals(message.sound, 'zona-bright.wav');
  assertEquals(message.channelId, 'zona_bright');
});

Deno.test('native phone sounds pass the allow-list and map to the system sound', () => {
  // The stored choices survive the allow-list unchanged...
  assertEquals(resolveSound(true, 'native-notification'), 'native-notification');
  assertEquals(resolveSound(true, 'native-alarm'), 'native-alarm');
  assertEquals(resolveSound(true, 'native-ringtone'), 'native-ringtone');
  assertEquals(resolveSound(false, 'native-alarm'), null);

  // ...while the payload sound honors the APNs / pinned-Android limit: only
  // `default` or bundled files can play, so native choices carry `default`
  // (exact for native-notification, documented degradation for alarm/ringtone).
  assertEquals(pushPayloadSound('native-notification'), 'default');
  assertEquals(pushPayloadSound('native-alarm'), 'default');
  assertEquals(pushPayloadSound('native-ringtone'), 'default');
  assertEquals(pushPayloadSound('default'), 'default');
  assertEquals(pushPayloadSound('zona-soft.wav'), 'zona-soft.wav');

  // Each native choice keeps its own Android channel id, matching the app-side
  // mapping in zona/src/lib/notification-sound-map.ts.
  assertEquals(soundChannelId('native-notification'), 'zona_native_notification');
  assertEquals(soundChannelId('native-alarm'), 'zona_native_alarm');
  assertEquals(soundChannelId('native-ringtone'), 'zona_native_ringtone');

  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Title',
    'Body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    { soundName: 'native-ringtone', showPreview: true },
  );
  assertEquals(message.sound, 'default');
  assertEquals(message.channelId, 'zona_native_ringtone');
});

Deno.test('ticket errors are recorded even when Expo returns HTTP 200', () => {
  assertEquals(ticketError({ status: 'ok', id: 'ticket' }, true), null);
  assertEquals(ticketError({ status: 'error', details: { error: 'DeviceNotRegistered' } }, true), 'DeviceNotRegistered');
  assertEquals(ticketError(null, false), 'EXPO_REQUEST_FAILED');
});
