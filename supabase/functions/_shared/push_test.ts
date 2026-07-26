import { assertEquals, assertThrows } from '@std/assert';

import {
  assertPushPayloadFits,
  byteLength,
  chunk,
  createPushMessage,
  MAX_EXPO_MESSAGE_BYTES,
  resolveDeviceChannelId,
  resolveDeviceSound,
  resolveSound,
  soundChannelId,
  sourceNotificationChannelId,
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

Deno.test('severity colors the Android icon and travels in routing data', () => {
  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Critical alert',
    'Production is down',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    {
      color: '#E9435D',
      severity: 'critical',
      soundName: 'default',
      showPreview: true,
    },
  );
  assertEquals(message.color, '#E9435D');
  assertEquals(message.data, {
    notificationId: '00000000-0000-4000-8000-000000000000',
    sourceId: '00000000-0000-4000-8000-000000000001',
    severity: 'critical',
  });
});

Deno.test('per-source sounds are allowlisted and respect the global setting', () => {
  assertEquals(resolveSound(true, 'ios-note.wav'), 'ios-note.wav');
  assertEquals(resolveSound(true, 'ios-xylophone.wav'), 'ios-xylophone.wav');
  assertEquals(resolveSound(true, 'not-bundled.wav'), 'default');
  assertEquals(resolveSound(true, 'silent'), null);
  assertEquals(resolveSound(false, 'ios-urgent.wav'), null);

  // Retired Zona presets and any other unknown stored value degrade safely
  // to the default sound on the push path.
  assertEquals(resolveSound(true, 'zona-soft.wav'), 'default');
  assertEquals(resolveSound(true, 'zona-bloom.wav'), 'default');

  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Title',
    'Body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    { soundName: 'ios-marimba.wav', showPreview: true },
  );
  assertEquals(message.sound, 'ios-marimba.wav');
  assertEquals(message.channelId, 'zona_default');
});

Deno.test('Android uses channels that exist without bundling iPhone tones', () => {
  assertEquals(resolveDeviceSound('ios', 'ios-aurora.wav'), 'ios-aurora.wav');
  assertEquals(resolveDeviceSound('android', 'ios-aurora.wav'), 'default');
  assertEquals(resolveDeviceSound('android', 'default'), 'default');
  assertEquals(resolveDeviceSound('android', null), null);
  const sourceId = '00000000-0000-4000-8000-000000000001';
  assertEquals(sourceNotificationChannelId(sourceId), 'zona_source_00000000_0000_4000_8000_000000000001');
  assertEquals(resolveDeviceChannelId('android', sourceId, 'default'), sourceNotificationChannelId(sourceId));
  assertEquals(resolveDeviceChannelId('android', sourceId, null), 'zona_silent');
  assertEquals(resolveDeviceChannelId('ios', sourceId, 'ios-aurora.wav'), 'zona_default');
});

Deno.test('bundled iPhone tones pass the allow-list and travel as basenames', () => {
  // APNs plays bundled files by basename, so the stored choice survives
  // end to end unchanged.
  assertEquals(resolveSound(true, 'ios-aurora.wav'), 'ios-aurora.wav');
  assertEquals(resolveSound(true, 'ios-boing.wav'), 'ios-boing.wav');
  assertEquals(resolveSound(true, 'ios-harp.wav'), 'ios-harp.wav');
  assertEquals(resolveSound(true, 'ios-stargaze.wav'), 'ios-stargaze.wav');
  assertEquals(resolveSound(true, 'ios-by-the-seaside.wav'), 'ios-by-the-seaside.wav');
  assertEquals(resolveSound(false, 'ios-glass.wav'), null);
  assertEquals(resolveSound(true, 'ios-not-bundled.wav'), 'default');

  // Android uses the default channel because these files are bundled only in
  // iOS builds.
  assertEquals(soundChannelId('ios-aurora.wav'), 'zona_default');
  assertEquals(soundChannelId('ios-bell-tower.wav'), 'zona_default');
  assertEquals(soundChannelId('ios-by-the-seaside.wav'), 'zona_default');

  const message = createPushMessage(
    'ExpoPushToken[token]',
    'Title',
    'Body',
    'Office',
    '00000000-0000-4000-8000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    { soundName: 'ios-aurora.wav', showPreview: true },
  );
  assertEquals(message.sound, 'ios-aurora.wav');
  assertEquals(message.channelId, 'zona_default');
});

Deno.test('ticket errors are recorded even when Expo returns HTTP 200', () => {
  assertEquals(ticketError({ status: 'ok', id: 'ticket' }, true), null);
  assertEquals(ticketError({ status: 'error', details: { error: 'DeviceNotRegistered' } }, true), 'DeviceNotRegistered');
  assertEquals(ticketError(null, false), 'EXPO_REQUEST_FAILED');
});
