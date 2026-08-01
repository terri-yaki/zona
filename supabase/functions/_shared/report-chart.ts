export type DailyChartPoint = {
  date: string;
  notifications: number;
  activeUsers: number;
  pushAccepted: number;
  errors: number;
};

const width = 1000;
const height = 560;
const colors = {
  background: [244, 248, 246, 255],
  header: [28, 73, 63, 255],
  grid: [210, 221, 217, 255],
  ink: [38, 56, 50, 255],
  white: [255, 255, 255, 255],
  muted: [98, 117, 110, 255],
  notifications: [75, 196, 143, 255],
  users: [162, 126, 234, 255],
  push: [246, 196, 83, 255],
  errors: [239, 100, 100, 255],
} as const;

const glyphs: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '%': ['11001', '11010', '00100', '01000', '10110', '00110', '00000'],
  '(': ['00110', '01100', '11000', '11000', '11000', '01100', '00110'],
  ')': ['01100', '00110', '00011', '00011', '00011', '00110', '01100'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

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

function textWidth(value: string, scale: number): number {
  return Math.max(0, value.length * 6 * scale - scale);
}

function drawText(
  pixels: Uint8Array,
  value: string,
  x: number,
  y: number,
  scale: number,
  color: readonly number[],
) {
  let cursor = Math.floor(x);
  for (const character of value.toUpperCase()) {
    const glyph = glyphs[character] ?? glyphs[' '];
    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column += 1) {
        if (row[column] === '1') fillRect(pixels, cursor + column * scale, y + rowIndex * scale, scale, scale, color);
      }
    });
    cursor += 6 * scale;
  }
}

function drawCenteredText(
  pixels: Uint8Array,
  value: string,
  center: number,
  y: number,
  scale: number,
  color: readonly number[],
) {
  drawText(pixels, value, center - textWidth(value, scale) / 2, y, scale, color);
}

/** Dependency-free PNG renderer suitable for the Supabase Edge runtime. */
export async function renderDailyStatsChart(points: DailyChartPoint[]): Promise<Uint8Array> {
  const pixels = new Uint8Array(width * height * 4);
  fillRect(pixels, 0, 0, width, height, colors.background);
  fillRect(pixels, 0, 0, width, 104, colors.header);
  drawText(pixels, 'ZONA 7-DAY PULSE', 42, 20, 5, colors.white);
  drawText(pixels, 'HONG KONG TIME - MIDNIGHT CUTOFF', 44, 72, 2, colors.white);

  const chartLeft = 90;
  const chartTop = 134;
  const chartWidth = 850;
  const chartHeight = 292;
  const safePoints = points.slice(-7);
  const maximum = Math.max(1, ...safePoints.flatMap((point) => [point.notifications, point.activeUsers, point.pushAccepted, point.errors]));
  for (let line = 0; line <= 4; line += 1) {
    const y = chartTop + (chartHeight * line) / 4;
    fillRect(pixels, chartLeft, y, chartWidth, 2, colors.grid);
    const label = String(Math.round(maximum * (4 - line) / 4));
    drawText(pixels, label, chartLeft - 12 - textWidth(label, 2), y - 7, 2, colors.muted);
  }

  const groupWidth = chartWidth / Math.max(1, safePoints.length);
  const barWidth = Math.max(8, Math.min(22, groupWidth / 5));

  safePoints.forEach((point, index) => {
    const center = chartLeft + groupWidth * index + groupWidth / 2;
    const values = [point.notifications, point.activeUsers, point.pushAccepted, point.errors];
    const palette = [colors.notifications, colors.users, colors.push, colors.errors];
    values.forEach((value, series) => {
      const barHeight = Math.max(value > 0 ? 4 : 0, (Math.max(0, value) / maximum) * chartHeight);
      const x = center + (series - 1.5) * (barWidth + 5) - barWidth / 2;
      fillRect(pixels, x, chartTop + chartHeight - barHeight, barWidth, barHeight, palette[series]);
      if (value > 0) {
        drawCenteredText(
          pixels,
          String(value),
          x + barWidth / 2,
          Math.max(chartTop - 10, chartTop + chartHeight - barHeight - 13),
          1,
          colors.ink,
        );
      }
    });
    drawCenteredText(pixels, point.date.slice(5), center, chartTop + chartHeight + 12, 2, colors.muted);
  });

  const legend = [
    { x: 66, label: 'NOTIFICATIONS', color: colors.notifications },
    { x: 310, label: 'ACTIVE USERS', color: colors.users },
    { x: 550, label: 'PUSH ACCEPTED', color: colors.push },
    { x: 800, label: 'ERRORS', color: colors.errors },
  ];
  for (const item of legend) {
    fillRect(pixels, item.x, 516, 22, 12, item.color);
    drawText(pixels, item.label, item.x + 31, 515, 2, colors.ink);
  }

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
