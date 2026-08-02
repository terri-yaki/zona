import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const failures = [];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.flatMap((entry) => {
    if (entry.name === 'versions' || entry.name === 'node_modules' || entry.name === '.git') return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  }));
  return nested.flat();
}

const markdown = await markdownFiles(root);
for (const filePath of markdown) {
  const source = await readFile(filePath, 'utf8');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (!target || /^(?:https?:|mailto:|#|data:)/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(filePath), target);
    if (!await exists(resolved)) {
      failures.push(`${path.relative(root, filePath)} links to missing ${target}`);
    }
  }
}

const [appConfig, packageJson, packageLock, changelog, docsIndex] = await Promise.all([
  readFile(path.join(root, 'zona', 'app.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'zona', 'package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'zona', 'package-lock.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
  readFile(path.join(root, 'docs', 'README.md'), 'utf8'),
]);

const appVersion = appConfig?.expo?.version;
if (!appVersion || appVersion !== packageJson.version) {
  failures.push(`zona/app.json version ${appVersion ?? 'missing'} does not match zona/package.json ${packageJson.version ?? 'missing'}`);
}
if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) {
  failures.push(`zona/package-lock.json root version does not match zona/package.json ${packageJson.version ?? 'missing'}`);
}
if (!changelog.includes(`## [${appVersion}]`) && /## \[Unreleased\]\s+No entries yet\./.test(changelog)) {
  failures.push(`CHANGELOG.md has neither a ${appVersion} release section nor Unreleased entries`);
}

const liveDocs = (await readdir(path.join(root, 'docs')))
  .filter((name) => name.endsWith('.md') && name !== 'README.md');
for (const name of liveDocs) {
  if (!docsIndex.includes(`(${name})`)) failures.push(`docs/README.md does not index ${name}`);
}

const releaseDirectories = (await readdir(path.join(root, 'versions'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
const versionsIndex = await readFile(path.join(root, 'versions', 'README.md'), 'utf8');
for (const version of releaseDirectories) {
  if (!versionsIndex.includes(`${version}/`)) failures.push(`versions/README.md does not index ${version}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Documentation checks passed (${markdown.length} live Markdown files, release ${appVersion}).`);
