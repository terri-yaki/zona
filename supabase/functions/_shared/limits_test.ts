import { assertEquals } from '@std/assert';

import { FALLBACK_ATTACHMENT_MAX_BYTES, MULTIPART_OVERHEAD_BYTES, resolveSenderLimits, type UniversalAppOptionRow } from './limits.ts';

const rows: UniversalAppOptionRow[] = [
  { option_name: 'attachment_max_bytes_standard', value: '5242880' },
  { option_name: 'attachment_max_bytes_premium', value: '20971520' },
];

Deno.test('missing options fall back to the pre-configurable constants', () => {
  for (const isPremium of [false, true]) {
    const limits = resolveSenderLimits(null, isPremium);
    assertEquals(limits.attachmentMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES);
    assertEquals(limits.multipartMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES);
  }
});

Deno.test('standard tier resolves the standard attachment cap', () => {
  const limits = resolveSenderLimits(rows, false);
  assertEquals(limits.attachmentMaxBytes, 5 * 1024 * 1024);
  assertEquals(limits.multipartMaxBytes, 6 * 1024 * 1024);
});

Deno.test('premium tier resolves the premium attachment cap', () => {
  const limits = resolveSenderLimits(rows, true);
  assertEquals(limits.attachmentMaxBytes, 20 * 1024 * 1024);
  assertEquals(limits.multipartMaxBytes, 21 * 1024 * 1024);
});

Deno.test('invalid configured values fall back to the safe constant', () => {
  const broken: UniversalAppOptionRow[] = [
    { option_name: 'attachment_max_bytes_standard', value: 'zero' },
    { option_name: 'attachment_max_bytes_premium', value: '-1' },
  ];
  assertEquals(resolveSenderLimits(broken, false).attachmentMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES);
  assertEquals(resolveSenderLimits(broken, true).attachmentMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES);
});
