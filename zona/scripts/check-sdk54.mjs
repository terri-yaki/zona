import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expoVersion = packageJson.dependencies?.expo ?? '';

if (!/^~54\./.test(expoVersion)) {
  console.error(`Expected Expo SDK 54, but package.json declares ${expoVersion || 'no Expo version'}.`);
  process.exit(1);
}

console.log(`Expo SDK 54 is pinned (${expoVersion}).`);
