export type DailyChartPoint = {
  date: string;
  notifications: number;
  pushAccepted: number;
  errors: number;
};

const width = 1000;
const height = 560;
const colors = {
  background: [244, 248, 246, 255],
  header: [28, 73, 63, 255],
  grid: [210, 221, 217, 255],
  notifications: [75, 196, 143, 255],
  push: [246, 196, 83, 255],
  errors: [239, 100, 100, 255],
} as const;

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(type);
  return concat([u32(data.length), name, data, u32(crc32(concat([name, data])))]);
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data).buffer]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function fillRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: readonly number[],
) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(width, Math.ceil(x + rectWidth));
  const bottom = Math.min(height, Math.ceil(y + rectHeight));
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const offset = (row * width + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }
}

/** Dependency-free PNG renderer suitable for the Supabase Edge runtime. */
export async function renderDailyStatsChart(points: DailyChartPoint[]): Promise<Uint8Array> {
  const pixels = new Uint8Array(width * height * 4);
  fillRect(pixels, 0, 0, width, height, colors.background);
  fillRect(pixels, 0, 0, width, 92, colors.header);

  const chartLeft = 64;
  const chartTop = 132;
  const chartWidth = 872;
  const chartHeight = 348;
  for (let line = 0; line <= 4; line += 1) {
    fillRect(pixels, chartLeft, chartTop + (chartHeight * line) / 4, chartWidth, 2, colors.grid);
  }

  const safePoints = points.slice(-7);
  const maximum = Math.max(1, ...safePoints.flatMap((point) => [point.notifications, point.pushAccepted, point.errors]));
  const groupWidth = chartWidth / Math.max(1, safePoints.length);
  const barWidth = Math.max(10, Math.min(30, groupWidth / 4));

  safePoints.forEach((point, index) => {
    const center = chartLeft + groupWidth * index + groupWidth / 2;
    const values = [point.notifications, point.pushAccepted, point.errors];
    const palette = [colors.notifications, colors.push, colors.errors];
    values.forEach((value, series) => {
      const barHeight = Math.max(value > 0 ? 4 : 0, (Math.max(0, value) / maximum) * chartHeight);
      const x = center + (series - 1) * (barWidth + 7) - barWidth / 2;
      fillRect(pixels, x, chartTop + chartHeight - barHeight, barWidth, barHeight, palette[series]);
    });
  });

  fillRect(pixels, 64, 510, 26, 12, colors.notifications);
  fillRect(pixels, 354, 510, 26, 12, colors.push);
  fillRect(pixels, 644, 510, 26, 12, colors.errors);

  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const target = row * (1 + width * 4);
    scanlines[target] = 0;
    scanlines.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), target + 1);
  }

  const ihdr = concat([u32(width), u32(height), new Uint8Array([8, 6, 0, 0, 0])]);
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(scanlines)),
    chunk('IEND', new Uint8Array()),
  ]);
}
