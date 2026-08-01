export const accountActions = [
  'account.delete',
  'identity.link',
  'identity.unlink',
  'installation.revoke',
  'sessions.revoke.others',
  'sessions.revoke.all',
] as const;

export type AccountAction = typeof accountActions[number];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAccountAction(value: unknown): AccountAction | null {
  return typeof value === 'string' && (accountActions as readonly string[]).includes(value) ? value as AccountAction : null;
}

export function parseActionTarget(action: AccountAction, value: unknown) {
  const target = typeof value === 'string' ? value : '';
  if (action === 'identity.link') {
    return /^(email:[^\s@]+@[^\s@]+\.[^\s@]+|provider:(apple|github|google))$/.test(target) &&
        target.length <= 200
      ? target
      : null;
  }
  if (action === 'identity.unlink' || action === 'installation.revoke') {
    return uuidPattern.test(target) ? target : null;
  }
  return target === '' ? '' : null;
}

export function bearerValue(value: string | null) {
  return value?.startsWith('Bearer ') && value.length > 39 ? value.slice(7) : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function mostRecentProofIdentity<T extends { identity_id?: string; last_sign_in_at?: string }>(
  identities: T[] | null | undefined,
  now = Date.now(),
) {
  return (identities ?? [])
    .map((identity) => ({ identity, signedInAt: Date.parse(identity.last_sign_in_at ?? '') }))
    .filter(({ identity, signedInAt }) =>
      Boolean(identity.identity_id) &&
      Number.isFinite(signedInAt) && now - signedInAt >= 0 && now - signedInAt <= 10 * 60_000
    )
    .sort((left, right) => right.signedInAt - left.signedInAt)[0]?.identity ?? null;
}
