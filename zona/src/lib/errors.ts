type ResponseLike = {
  json: () => Promise<unknown>;
  status?: number;
};

const messages: Record<string, string> = {
  CREATE_RATE_LIMITED: 'Too many sources were created recently. Try again later.',
  IDEMPOTENCY_CONFLICT: 'This request key was already used for different content.',
  INTERNAL_ERROR: 'The service could not complete the request. Try again.',
  INVALID_ACTION: 'The requested action is not supported.',
  INVALID_DEVICE: 'This device registration is invalid. Try registering again.',
  INVALID_PAYLOAD: 'Some submitted information is invalid.',
  INVALID_SOURCE: 'Check the source name and hostname, then try again.',
  INVALID_TOKEN: 'The source credential is invalid or has been revoked.',
  METHOD_NOT_ALLOWED: 'The requested operation is not supported.',
  PAYLOAD_TOO_LARGE: 'The submitted information is too large.',
  RATE_LIMITED: 'Too many requests were sent. Wait a moment and try again.',
  SOURCE_NOT_FOUND: 'This source no longer exists or has already been revoked.',
  TOKEN_CONFLICT: 'This notification token is already registered to another account.',
  UNAUTHORIZED: 'Your session has expired. Sign in again.',
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

  const message = messages[code] ?? (code === 'NETWORK_ERROR' ? 'Check your connection and try again.' : fallback);
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

export function userMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback;
}
