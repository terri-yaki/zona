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

/** Soft harmonic series for a slightly richer tone than pure sine. */
function tone(frequency, localTime, volume, gain) {
  if (gain <= 0) return 0;
  const fundamental = Math.sin(2 * Math.PI * frequency * localTime);
  const second = Math.sin(4 * Math.PI * frequency * localTime) * 0.12;
  const third = Math.sin(6 * Math.PI * frequency * localTime) * 0.05;
  return (fundamental + second + third) * gain * volume;
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
      value += tone(voice.frequency, time - voice.start, voice.volume, gain);
    }
    const softened = Math.tanh(value * 1.15) * 0.74;
    bytes.writeInt16LE(Math.round(softened * 32_767), 44 + index * 2);
  }
  writeFileSync(resolve(output, fileName), bytes);
  console.log(`wrote ${fileName}`);
}

mkdirSync(output, { recursive: true });

// Existing presets
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

// New presets
render('zona-chime.wav', 1.35, [
  // Classic doorbell: E5 → C5
  { start: 0, duration: 0.55, frequency: 659.25, volume: 0.32, attack: 0.01, release: 0.28 },
  { start: 0.28, duration: 0.95, frequency: 523.25, volume: 0.3, attack: 0.012, release: 0.48 },
]);

render('zona-crystal.wav', 1.25, [
  // High sparkling cascade
  { start: 0, duration: 0.35, frequency: 1046.5, volume: 0.22, attack: 0.008, release: 0.18 },
  { start: 0.12, duration: 0.4, frequency: 1318.5, volume: 0.2, attack: 0.008, release: 0.2 },
  { start: 0.26, duration: 0.45, frequency: 1568, volume: 0.18, attack: 0.008, release: 0.24 },
  { start: 0.42, duration: 0.7, frequency: 2093, volume: 0.14, attack: 0.01, release: 0.4 },
]);

render('zona-warm.wav', 1.4, [
  // Warm low major arpeggio (C3–E3–G3–C4)
  { start: 0, duration: 0.7, frequency: 130.81, volume: 0.28, attack: 0.03, release: 0.4 },
  { start: 0.18, duration: 0.75, frequency: 164.81, volume: 0.26, attack: 0.03, release: 0.4 },
  { start: 0.36, duration: 0.8, frequency: 196, volume: 0.24, attack: 0.03, release: 0.42 },
  { start: 0.54, duration: 0.82, frequency: 261.63, volume: 0.22, attack: 0.03, release: 0.45 },
]);

render('zona-pulse.wav', 1.2, [
  // Soft double pulse
  { start: 0, duration: 0.28, frequency: 440, volume: 0.3, attack: 0.012, release: 0.14 },
  { start: 0.08, duration: 0.28, frequency: 554.37, volume: 0.18, attack: 0.012, release: 0.14 },
  { start: 0.48, duration: 0.42, frequency: 440, volume: 0.28, attack: 0.012, release: 0.22 },
  { start: 0.56, duration: 0.42, frequency: 659.25, volume: 0.16, attack: 0.012, release: 0.22 },
]);

render('zona-signal.wav', 0.95, [
  // Clean short attention signal
  { start: 0, duration: 0.18, frequency: 880, volume: 0.34, attack: 0.006, release: 0.08 },
  { start: 0.22, duration: 0.18, frequency: 880, volume: 0.34, attack: 0.006, release: 0.08 },
  { start: 0.46, duration: 0.38, frequency: 1174.7, volume: 0.3, attack: 0.008, release: 0.18 },
]);

render('zona-bloom.wav', 1.5, [
  // Rising bloom / open chord
  { start: 0, duration: 1.1, frequency: 349.23, volume: 0.2, attack: 0.08, release: 0.55 },
  { start: 0.12, duration: 1.15, frequency: 440, volume: 0.2, attack: 0.1, release: 0.55 },
  { start: 0.28, duration: 1.15, frequency: 523.25, volume: 0.18, attack: 0.12, release: 0.55 },
  { start: 0.48, duration: 0.95, frequency: 698.46, volume: 0.16, attack: 0.12, release: 0.5 },
]);
