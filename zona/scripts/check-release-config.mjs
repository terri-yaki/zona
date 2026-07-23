import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [appConfig, packageJson] = await Promise.all([
  readFile(new URL('app.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
]);
const expo = appConfig.expo ?? {};
const failures = [];

if (!/^~54\./.test(packageJson.dependencies?.expo ?? '')) failures.push('Expo must remain pinned to SDK 54.');
if (!expo.ios?.bundleIdentifier || expo.ios.bundleIdentifier === 'com.example.zona') failures.push('Set an owned iOS bundle identifier in app.json.');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expo.extra?.eas?.projectId ?? '')) failures.push('Replace the EAS project ID placeholder with the UUID from `eas init`.');
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) failures.push('Configure EXPO_PUBLIC_SUPABASE_URL in the build environment.');
if (!process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) failures.push('Configure EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the build environment.');

try {
  await access(new URL(expo.icon, root));
} catch {
  failures.push('The configured app icon is missing.');
}

if (failures.length) {
  console.error('Release configuration is incomplete:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Release configuration checks passed.');
