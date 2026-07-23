import { assertEquals } from '@std/assert';
import { sniffImageMime } from './image.ts';

Deno.test('sniffs png, jpeg, and webp magic bytes', () => {
  assertEquals(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assertEquals(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'image/jpeg');
  assertEquals(
    sniffImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])),
    'image/webp',
  );
});

Deno.test('rejects executables, svg, and truncated data', () => {
  assertEquals(sniffImageMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null); // MZ executable
  assertEquals(sniffImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assertEquals(sniffImageMime(new Uint8Array([0x89, 0x50])), null);
  assertEquals(sniffImageMime(new Uint8Array([])), null);
});
