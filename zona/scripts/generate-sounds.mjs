import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generate short linear-PCM WAV notification tones for iOS/Android.
 * iOS APNs custom sounds: mono/stereo, 16-bit LPCM, ≤30s, in the app bundle.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'assets', 'sounds');
const sampleRate = 44_100;

function envelope(time, start, duration, attack = 0.012, release = 0.14) {
  const local = time - start;
  if (local < 0 || local >= duration) return 0;
  const a = Math.max(0.004, attack);
  const r = Math.max(0.02, release);
  if (local < a) return local / a;
  if (local > duration - r) return Math.max(0, (duration - local) / r);
  return 1;
}

function tone(frequency, localTime, volume, gain, wave = 'sine') {
  if (gain <= 0) return 0;
  const phase = 2 * Math.PI * frequency * localTime;
  let sample = Math.sin(phase);
  if (wave === 'triangle') {
    sample = 2 * Math.abs(2 * ((frequency * localTime) % 1) - 1) - 1;
  } else if (wave === 'square') {
    sample = Math.sin(phase) >= 0 ? 0.55 : -0.55;
  }
  // Soft harmonics help the tone cut through vs a pure sine.
  sample += Math.sin(2 * phase) * 0.18;
  sample += Math.sin(3 * phase) * 0.06;
  return sample * gain * volume;
}

function render(fileName, duration, voices) {
  const samples = Math.ceil(duration * sampleRate);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // mono
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
      value += tone(voice.frequency, time - voice.start, voice.volume, gain, voice.wave);
    }
    // Higher drive so notification tones are audible vs the system default.
    const softened = Math.tanh(value * 1.6) * 0.92;
    bytes.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(softened * 32_767))), 44 + index * 2);
  }
  writeFileSync(resolve(output, fileName), bytes);
  console.log(`wrote ${fileName} (${duration.toFixed(2)}s)`);
}

mkdirSync(output, { recursive: true });

// Distinct characters so users can tell them apart from each other and from iOS default.
render('zona-soft.wav', 1.1, [
  { start: 0, duration: 0.65, frequency: 523.25, volume: 0.55, release: 0.4, wave: 'sine' },
  { start: 0.18, duration: 0.8, frequency: 659.25, volume: 0.48, release: 0.45, wave: 'sine' },
]);

render('zona-bright.wav', 1.0, [
  { start: 0, duration: 0.32, frequency: 784, volume: 0.62, release: 0.14, wave: 'triangle' },
  { start: 0.16, duration: 0.34, frequency: 988, volume: 0.6, release: 0.14, wave: 'triangle' },
  { start: 0.34, duration: 0.55, frequency: 1318.5, volume: 0.55, release: 0.28, wave: 'triangle' },
]);

render('zona-urgent.wav', 1.45, [
  { start: 0, duration: 0.28, frequency: 880, volume: 0.7, release: 0.08, wave: 'square' },
  { start: 0.36, duration: 0.28, frequency: 880, volume: 0.7, release: 0.08, wave: 'square' },
  { start: 0.72, duration: 0.45, frequency: 1174.7, volume: 0.72, release: 0.14, wave: 'square' },
]);

render('zona-chime.wav', 1.25, [
  { start: 0, duration: 0.5, frequency: 659.25, volume: 0.62, attack: 0.006, release: 0.28, wave: 'sine' },
  { start: 0.26, duration: 0.9, frequency: 523.25, volume: 0.58, attack: 0.008, release: 0.5, wave: 'sine' },
]);

render('zona-crystal.wav', 1.15, [
  { start: 0, duration: 0.28, frequency: 1318.5, volume: 0.5, attack: 0.004, release: 0.14, wave: 'triangle' },
  { start: 0.1, duration: 0.32, frequency: 1568, volume: 0.48, attack: 0.004, release: 0.16, wave: 'triangle' },
  { start: 0.22, duration: 0.36, frequency: 2093, volume: 0.42, attack: 0.004, release: 0.2, wave: 'triangle' },
  { start: 0.38, duration: 0.65, frequency: 2637, volume: 0.36, attack: 0.006, release: 0.35, wave: 'triangle' },
]);

render('zona-warm.wav', 1.35, [
  { start: 0, duration: 0.7, frequency: 196, volume: 0.58, attack: 0.04, release: 0.4, wave: 'sine' },
  { start: 0.16, duration: 0.75, frequency: 246.94, volume: 0.52, attack: 0.04, release: 0.4, wave: 'sine' },
  { start: 0.34, duration: 0.8, frequency: 293.66, volume: 0.48, attack: 0.04, release: 0.42, wave: 'sine' },
  { start: 0.52, duration: 0.78, frequency: 392, volume: 0.44, attack: 0.04, release: 0.45, wave: 'sine' },
]);

render('zona-pulse.wav', 1.15, [
  { start: 0, duration: 0.26, frequency: 440, volume: 0.6, attack: 0.008, release: 0.12, wave: 'sine' },
  { start: 0.06, duration: 0.26, frequency: 554.37, volume: 0.4, attack: 0.008, release: 0.12, wave: 'sine' },
  { start: 0.46, duration: 0.4, frequency: 440, volume: 0.58, attack: 0.008, release: 0.2, wave: 'sine' },
  { start: 0.54, duration: 0.4, frequency: 659.25, volume: 0.38, attack: 0.008, release: 0.2, wave: 'sine' },
]);

render('zona-signal.wav', 0.9, [
  { start: 0, duration: 0.16, frequency: 988, volume: 0.7, attack: 0.003, release: 0.06, wave: 'square' },
  { start: 0.2, duration: 0.16, frequency: 988, volume: 0.7, attack: 0.003, release: 0.06, wave: 'square' },
  { start: 0.42, duration: 0.36, frequency: 1318.5, volume: 0.65, attack: 0.004, release: 0.16, wave: 'square' },
]);

render('zona-bloom.wav', 1.4, [
  { start: 0, duration: 1.05, frequency: 349.23, volume: 0.42, attack: 0.06, release: 0.5, wave: 'sine' },
  { start: 0.1, duration: 1.1, frequency: 440, volume: 0.4, attack: 0.08, release: 0.5, wave: 'sine' },
  { start: 0.24, duration: 1.1, frequency: 523.25, volume: 0.38, attack: 0.1, release: 0.5, wave: 'sine' },
  { start: 0.42, duration: 0.9, frequency: 698.46, volume: 0.36, attack: 0.1, release: 0.45, wave: 'sine' },
]);
