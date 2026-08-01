import { corsHeaders } from './cors.ts';

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
  });
}

/** Read a request body with a hard stream byte cap, ignoring understated Content-Length. */
export async function readBodyBytes(
  req: Request,
  maxBytes: number,
  emptyError = 'INVALID_JSON',
): Promise<Uint8Array> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  if (!req.body) throw new Error(emptyError);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) throw new Error('CONTENT_TYPE');

  const bytes = await readBodyBytes(req, maxBytes, 'INVALID_JSON');

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('INVALID_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
  return value as Record<string, unknown>;
}
