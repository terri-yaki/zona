// Resolution of operator-configured limits from public.universal_app_options.
// Postgres is the enforcement authority (private.effective_limit); the Edge
// Function mirrors the same values only to reject oversized uploads before
// parsing the request body. Any missing value falls back to the constants
// that were hardcoded before limits became configurable.

export type UniversalAppOptionRow = {
  option_name: string;
  value: string;
};

export type SenderLimits = {
  attachmentMaxBytes: number;
  // Transport ceiling for the whole multipart request: the image plus room
  // for the text fields and multipart framing.
  multipartMaxBytes: number;
};

export const FALLBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function findOption(
  rows: UniversalAppOptionRow[] | null,
  name: string,
  fallback: number,
): number {
  const raw = rows?.find((row) => row.option_name === name)?.value;
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSenderLimits(
  rows: UniversalAppOptionRow[] | null,
  isPremium: boolean,
): SenderLimits {
  const key = isPremium ? 'attachment_max_bytes_premium' : 'attachment_max_bytes_standard';
  const attachmentMaxBytes = findOption(rows, key, FALLBACK_ATTACHMENT_MAX_BYTES);
  return {
    attachmentMaxBytes,
    multipartMaxBytes: attachmentMaxBytes + MULTIPART_OVERHEAD_BYTES,
  };
}
