import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'assets', 'sounds');
const sampleRate = 44_100;

function envelope(time, start, duration, attack = 0.018, release = 0.16) {
  const local = time - start;
  if (local < 0 || local >= duration) return 0;
  return Math.min(1, local / attack, (duration - local) / release);
}

function render(fileName, duration, voices) {
  const samples = Math.ceil(duration * sampleRate);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);

  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    let value = 0;
    for (const voice of voices) {
      const gain = envelope(time, voice.start, voice.duration, voice.attack, voice.release);
      value += Math.sin(2 * Math.PI * voice.frequency * (time - voice.start)) * gain * voice.volume;
      value += Math.sin(4 * Math.PI * voice.frequency * (time - voice.start)) * gain * voice.volume * 0.08;
    }
    const softened = Math.tanh(value * 1.2) * 0.72;
    bytes.writeInt16LE(Math.round(softened * 32_767), 44 + index * 2);
  }
  writeFileSync(resolve(output, fileName), bytes);
}

mkdirSync(output, { recursive: true });

render('zona-soft.wav', 1.15, [
  { start: 0, duration: 0.72, frequency: 523.25, volume: 0.27, release: 0.35 },
  { start: 0.2, duration: 0.82, frequency: 659.25, volume: 0.24, release: 0.4 },
]);

render('zona-bright.wav', 1.05, [
  { start: 0, duration: 0.38, frequency: 659.25, volume: 0.3, release: 0.19 },
  { start: 0.18, duration: 0.42, frequency: 830.61, volume: 0.3, release: 0.2 },
  { start: 0.38, duration: 0.55, frequency: 1046.5, volume: 0.27, release: 0.27 },
]);

render('zona-urgent.wav', 1.55, [
  { start: 0, duration: 0.34, frequency: 740, volume: 0.36, release: 0.1 },
  { start: 0.42, duration: 0.34, frequency: 740, volume: 0.36, release: 0.1 },
  { start: 0.84, duration: 0.48, frequency: 880, volume: 0.39, release: 0.16 },
]);
