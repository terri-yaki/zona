import { assertEquals, assertThrows } from '@std/assert';

import { parseSeverity, severityColor } from './severity.ts';

Deno.test('severity accepts four case-insensitive values and an empty default', () => {
  assertEquals(parseSeverity(undefined), null);
  assertEquals(parseSeverity(''), null);
  assertEquals(parseSeverity(' High '), 'high');
  assertEquals(parseSeverity('critical'), 'critical');
  assertThrows(() => parseSeverity('urgent'));
  assertThrows(() => parseSeverity(3));
});

Deno.test('severity maps to candy notification colors', () => {
  assertEquals(severityColor(null), undefined);
  assertEquals(severityColor('low'), '#35B968');
  assertEquals(severityColor('medium'), '#D5A514');
  assertEquals(severityColor('high'), '#ED8129');
  assertEquals(severityColor('critical'), '#E9435D');
});
