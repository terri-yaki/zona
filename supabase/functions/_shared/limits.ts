// Resolution of operator-configured limits from public.universal_app_options.
// Postgres is the enforcement authority (private.effective_limit); the Edge
// Function mirrors the same values only to reject oversized uploads before
// parsing the request body. Any missing value falls back to the constants
// that were hardcoded before limits became configurable.

export type UniversalAppOptions = {
  user_guide_url: string;
  max_api_keys_standard: number;
  max_api_keys_premium: number;
  retention_days_standard: number;
  retention_days_premium: number;
  notify_rpm_standard: number;
  notify_rpm_premium: number;
  attachment_max_bytes_standard: number;
  attachment_max_bytes_premium: number;
};

export type SenderLimits = {
  attachmentMaxBytes: number;
  // Transport ceiling for the whole multipart request: the image plus room
  // for the text fields and multipart framing.
  multipartMaxBytes: number;
};

export const FALLBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export function resolveSenderLimits(
  options: Pick<UniversalAppOptions, 'attachment_max_bytes_standard' | 'attachment_max_bytes_premium'> | null,
  isPremium: boolean,
): SenderLimits {
  const configured = isPremium ? options?.attachment_max_bytes_premium : options?.attachment_max_bytes_standard;
  const attachmentMaxBytes = Number.isInteger(configured) && (configured as number) > 0
    ? (configured as number)
    : FALLBACK_ATTACHMENT_MAX_BYTES;
  return {
    attachmentMaxBytes,
    multipartMaxBytes: attachmentMaxBytes + MULTIPART_OVERHEAD_BYTES,
  };
}
