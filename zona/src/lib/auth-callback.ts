import type { AuthIntent } from './auth-transactions';

export type AuthCallbackParams = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  tokenHash: string | null;
  transactionId: string | null;
  type: string | null;
};

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const get = (name: string) => query.get(name) ?? fragment.get(name);
  return {
    code: get('code'),
    error: get('error') ?? get('error_code'),
    errorDescription: get('error_description'),
    tokenHash: get('token_hash'),
    transactionId: get('zona_tx'),
    type: get('type'),
  };
}

export function assertSameUserUpgrade(intent: AuthIntent, expectedUserId: string | null, actualUserId: string) {
  if ((intent === 'protect_guest' || intent === 'link_method')
    && (!expectedUserId || expectedUserId !== actualUserId)) {
    throw new Error('ACCOUNT_CHANGED_DURING_LINK');
  }
}
