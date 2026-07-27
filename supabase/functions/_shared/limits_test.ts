import { assertEquals } from '@std/assert';

import { FALLBACK_ATTACHMENT_MAX_BYTES, MULTIPART_OVERHEAD_BYTES, resolveSenderLimits } from './limits.ts';

const options = {
  attachment_max_bytes_standard: 5 * 1024 * 1024,
  attachment_max_bytes_premium: 20 * 1024 * 1024,
};

Deno.test('missing options fall back to the pre-configurable constants', () => {
  for (const isPremium of [false, true]) {
    const limits = resolveSenderLimits(null, isPremium);
    assertEquals(limits.attachmentMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES);
    assertEquals(limits.multipartMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES);
  }
});

Deno.test('standard tier resolves the standard attachment cap', () => {
  const limits = resolveSenderLimits(options, false);
  assertEquals(limits.attachmentMaxBytes, 5 * 1024 * 1024);
  assertEquals(limits.multipartMaxBytes, 6 * 1024 * 1024);
});

Deno.test('premium tier resolves the premium attachment cap', () => {
  const limits = resolveSenderLimits(options, true);
  assertEquals(limits.attachmentMaxBytes, 20 * 1024 * 1024);
  assertEquals(limits.multipartMaxBytes, 21 * 1024 * 1024);
});

Deno.test('invalid configured values fall back to the safe constant', () => {
  for (
    const broken of [
      { attachment_max_bytes_standard: 0, attachment_max_bytes_premium: -1 },
      { attachment_max_bytes_standard: Number.NaN, attachment_max_bytes_premium: 2.5 },
    ]
  ) {
    assertEquals(resolveSenderLimits(broken, false).attachmentMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES);
    assertEquals(resolveSenderLimits(broken, true).attachmentMaxBytes, FALLBACK_ATTACHMENT_MAX_BYTES);
  }
});
