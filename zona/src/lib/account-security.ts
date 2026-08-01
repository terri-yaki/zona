import type { Session } from '@supabase/supabase-js';

import { translate } from '../i18n';
import { functionError } from './errors';
import { getInstallationId } from './installation';
import { supabase } from './supabase';

export type SensitiveAccountAction =
  | 'account.delete'
  | 'identity.link'
  | 'identity.unlink'
  | 'installation.revoke'
  | 'sessions.revoke.others'
  | 'sessions.revoke.all';

export const sensitiveAccountActions: readonly SensitiveAccountAction[] = [
  'account.delete',
  'identity.link',
  'identity.unlink',
  'installation.revoke',
  'sessions.revoke.others',
  'sessions.revoke.all',
];

export function isSensitiveAccountAction(value: unknown): value is SensitiveAccountAction {
  return typeof value === 'string' && (sensitiveAccountActions as readonly string[]).includes(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function invokeWithSecondary(
  name: string,
  body: Record<string, unknown>,
  secondarySession: Session,
) {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { 'x-reauth-token': `Bearer ${secondarySession.access_token}` },
  });
  if (error) throw await functionError(error, translate('error.default'));
  if (!record(data)) throw new Error('INVALID_SECURITY_RESPONSE');
  return data;
}

export async function createReauthGrant(
  action: SensitiveAccountAction,
  target: string,
  secondarySession: Session,
) {
  const installationId = await getInstallationId();
  const data = await invokeWithSecondary('reauthenticate', {
    action,
    target,
    installationId,
  }, secondarySession);
  if (typeof data.grant !== 'string') throw new Error('INVALID_SECURITY_RESPONSE');
  return data.grant;
}

export async function performAccountSecurityAction(
  action: Exclude<SensitiveAccountAction, 'account.delete'>,
  target: string,
  grant: string,
) {
  const { data, error } = await supabase.functions.invoke('account-security', {
    body: { action, target, grant },
  });
  if (error) throw await functionError(error, translate('error.default'));
  if (!record(data)) throw new Error('INVALID_SECURITY_RESPONSE');
  return data;
}
