import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { PostgrestError } from '@supabase/supabase-js';

import { claimInstallationForUser, getInstallationId } from '@/lib/installation';
import { supabase } from '@/lib/supabase';

export type AccountSummary = {
  accountId: string;
  displayName: string | null;
  emailVerified: boolean;
  identities: { createdAt: string | null; id: string; provider: string }[];
  isAnonymous: boolean;
  isProtected: boolean;
  recoveryEmail: string | null;
  status: string;
};

export type AccountInstallation = {
  appVersion: string | null;
  buildNumber: string | null;
  createdAt: string | null;
  deliveryEnabled: boolean;
  displayName: string | null;
  id: string;
  isCurrent: boolean;
  lastSeenAt: string | null;
  platform: string;
  revokedAt: string | null;
};

type RpcResult = Promise<{ data: unknown; error: PostgrestError | null }>;
const rpc = supabase.rpc as unknown as (name: string, args?: Record<string, unknown>) => RpcResult;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function stringValueOrNull(value: unknown) {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
}

export async function getAccountSummary(): Promise<AccountSummary> {
  const { data, error } = await rpc('get_account_summary');
  if (error) throw error;
  if (!record(data)) throw new Error('INVALID_ACCOUNT_RESPONSE');
  const account = record(data.account) ? data.account : data;
  const user = record(data.user) ? data.user : data;
  const accountId = stringOrNull(account.id ?? data.accountId ?? data.account_id);
  if (!accountId) throw new Error('INVALID_ACCOUNT_RESPONSE');
  const identityRows = Array.isArray(user.identities) ? user.identities : [];
  const identities = identityRows.flatMap((value) => {
    if (!record(value)) return [];
    const id = stringOrNull(value.id);
    const provider = stringOrNull(value.provider);
    return id && provider ? [{ createdAt: stringOrNull(value.createdAt ?? value.created_at), id, provider }] : [];
  });
  const isAnonymous = user.isAnonymous === true || user.is_anonymous === true;
  return {
    accountId,
    displayName: stringOrNull(account.displayName ?? account.display_name),
    emailVerified: user.emailVerified === true || user.email_verified === true,
    identities,
    isAnonymous,
    isProtected: !isAnonymous && identities.length > 0,
    recoveryEmail: stringOrNull(user.recoveryEmail ?? user.recovery_email),
    status: stringOrNull(account.status) ?? 'active',
  };
}

export async function bindCurrentInstallation(userId: string) {
  const installationId = await claimInstallationForUser(userId);
  const appVersion = Constants.expoConfig?.version ?? null;
  const buildValue = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : Constants.expoConfig?.android?.versionCode;
  const buildNumber = buildValue === undefined || buildValue === null ? null : Number(buildValue);
  const { data, error } = await rpc('bind_account_installation', {
    p_app_version: appVersion,
    p_build_number: buildNumber,
    p_display_name: null,
    p_installation_id: installationId,
    p_platform: Platform.OS,
  });
  if (error) throw error;
  return data;
}

export async function listAccountInstallations(): Promise<AccountInstallation[]> {
  const currentId = await getInstallationId();
  const { data, error } = await rpc('list_account_installations');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : record(data) && Array.isArray(data.installations) ? data.installations : [];
  return rows.flatMap((value) => {
    if (!record(value)) return [];
    const id = stringOrNull(value.id ?? value.installationId ?? value.installation_id);
    if (!id) return [];
    return [{
      appVersion: stringOrNull(value.appVersion ?? value.app_version),
      buildNumber: stringValueOrNull(value.buildNumber ?? value.build_number),
      createdAt: stringOrNull(value.createdAt ?? value.created_at),
      deliveryEnabled: value.deliveryEnabled !== false && value.delivery_enabled !== false,
      displayName: stringOrNull(value.displayName ?? value.display_name),
      id,
      isCurrent: value.isCurrent === true || value.is_current === true || id === currentId,
      lastSeenAt: stringOrNull(value.lastSeenAt ?? value.last_seen_at),
      platform: stringOrNull(value.platform) ?? 'unknown',
      revokedAt: stringOrNull(value.revokedAt ?? value.revoked_at),
    }];
  });
}

export async function revokeAccountInstallation(installationId: string) {
  const { data, error } = await rpc('revoke_account_installation', {
    p_installation_id: installationId,
  });
  if (error) throw error;
  return data;
}

export async function revokeOtherAccountInstallations() {
  const installations = await listAccountInstallations();
  await Promise.all(installations
    .filter((installation) => !installation.isCurrent && !installation.revokedAt)
    .map((installation) => revokeAccountInstallation(installation.id)));
}
