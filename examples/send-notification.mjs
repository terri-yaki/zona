import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const endpoint = process.env.ZONA_NOTIFY_URL ?? 'https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify';
const token = process.env.ZONA_SOURCE_TOKEN;

if (!token) {
  console.error('Set ZONA_SOURCE_TOKEN.');
  process.exit(2);
}

const [title = 'Test from Node.js', body = 'Zona is connected.'] = process.argv.slice(2);

// Optional evidence image (PNG/JPEG/WebP, at most 5 MiB).
const attachment = process.env.ZONA_ATTACHMENT ?? null;

// Reuse the same key when retrying a send; a replay returns the original
// notification instead of creating a duplicate.
const idempotencyKey = process.env.ZONA_IDEMPOTENCY_KEY ?? `node-${crypto.randomUUID()}`;

const headers = {
  authorization: `Bearer ${token}`,
  'idempotency-key': idempotencyKey,
};

let payload;
if (attachment) {
  const bytes = await readFile(attachment);
  const form = new FormData();
  form.set('title', title);
  form.set('body', body);
  form.set('category', 'test');
  form.set('data', JSON.stringify({ sender: 'send-notification.mjs' }));
  form.set('attachment', new File([bytes], basename(attachment)));
  payload = form;
} else {
  headers['content-type'] = 'application/json';
  payload = JSON.stringify({
    title,
    body,
    category: 'test',
    data: { sender: 'send-notification.mjs' },
  });
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers,
  body: payload,
  signal: AbortSignal.timeout(10_000),
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exit(1);
