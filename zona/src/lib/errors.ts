import { translate } from '../i18n';
import type { TranslationKey } from '../i18n/en';

type ResponseLike = {
  json: () => Promise<unknown>;
  status?: number;
};

const messageKeys: Record<string, TranslationKey> = {
  CREATE_RATE_LIMITED: 'error.CREATE_RATE_LIMITED',
  IDEMPOTENCY_CONFLICT: 'error.IDEMPOTENCY_CONFLICT',
  INTERNAL_ERROR: 'error.INTERNAL_ERROR',
  INVALID_ACTION: 'error.INVALID_ACTION',
  INVALID_DEVICE: 'error.INVALID_DEVICE',
  INVALID_PAYLOAD: 'error.INVALID_PAYLOAD',
  INVALID_SOURCE: 'error.INVALID_SOURCE',
  INVALID_TOKEN: 'error.INVALID_TOKEN',
  METHOD_NOT_ALLOWED: 'error.METHOD_NOT_ALLOWED',
  PAYLOAD_TOO_LARGE: 'error.PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'error.RATE_LIMITED',
  SOURCE_NOT_FOUND: 'error.SOURCE_NOT_FOUND',
  TOKEN_CONFLICT: 'error.TOKEN_CONFLICT',
  UNAUTHORIZED: 'error.UNAUTHORIZED',
};

export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: string, message: string, options: { retryable?: boolean; status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

function responseFrom(error: unknown): ResponseLike | null {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object' || !('json' in context) || typeof (context as ResponseLike).json !== 'function') return null;
  return context as ResponseLike;
}

export async function functionError(error: unknown, fallback: string): Promise<AppError> {
  const response = responseFrom(error);
  let code = 'NETWORK_ERROR';
  let status: number | undefined;

  if (response) {
    status = response.status;
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        code = payload.error;
      }
    } catch {
      code = status && status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    }
  }

  const message = messageKeys[code]
    ? translate(messageKeys[code])
    : code === 'NETWORK_ERROR'
      ? translate('error.connection')
      : fallback;
  return new AppError(code, message, {
    cause: error,
    retryable: code === 'NETWORK_ERROR' || code === 'INTERNAL_ERROR' || code.endsWith('RATE_LIMITED') || (status !== undefined && status >= 500),
    status,
  });
}

export function dataError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError) return error;
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'DATA_ERROR';
  return new AppError(code, fallback, { cause: error, retryable: true });
}

export function userMessage(error: unknown, fallback = translate('error.default')) {
  if (error instanceof AppError && messageKeys[error.code]) return translate(messageKeys[error.code]);
  return error instanceof Error && error.message ? error.message : fallback;
}
