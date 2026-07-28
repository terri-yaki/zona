import { assertEquals } from '@std/assert';

import { renderDailyStatsChart } from './report-chart.ts';

Deno.test('daily report chart is a valid PNG envelope', async () => {
  const image = await renderDailyStatsChart([
    { date: '2026-07-27', notifications: 8, pushAccepted: 7, errors: 1 },
  ]);
  assertEquals([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assertEquals(new TextDecoder().decode(image.subarray(image.length - 8, image.length - 4)), 'IEND');
});
