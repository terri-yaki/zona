export function createSourceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = String.fromCharCode(...bytes);
  const encoded = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `zona_live_${encoded}`;
}

export async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Bytes(value: Uint8Array): Promise<string> {
  const input = new ArrayBuffer(value.byteLength);
  new Uint8Array(input).set(value);
  const buffer = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
