import type { CreatedSource, DeleteAccountResult } from '@/types';

import { dataError, functionError } from './errors';
import { env } from './env';
import { createSourceCredential } from './source-token';
import { supabase } from './supabase';
import { isDeleteAccountResult } from './validation';
import type { NativePushPlatform } from './push-platform';
import { translate } from '@/i18n';

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function invoke<T>(name: string, body: Record<string, unknown>, validate: (value: unknown) => value is T): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw await functionError(error, translate('error.default'));
  if (!validate(data)) throw new Error(translate('error.default'));
  return data;
}

export async function createSource(displayName: string, hostname: string | null): Promise<CreatedSource> {
  const credential = await createSourceCredential();
  const { data: sourceId, error } = await supabase.rpc('create_source', {
    p_display_name: displayName,
    p_hostname: hostname,
    p_key_prefix: credential.keyPrefix,
    p_token_hash: credential.tokenHash,
  });
  if (error || typeof sourceId !== 'string') {
    throw dataError(error, translate('sourceNew.createError'));
  }
  return {
    sourceId,
    displayName,
    hostname,
    token: credential.token,
    ingestUrl: `${env.supabaseUrl}/functions/v1/notify`,
  };
}

export async function renameSource(sourceId: string, displayName: string) {
  const { data, error } = await supabase.rpc('manage_source', {
    p_action: 'rename',
    p_display_name: displayName,
    p_is_active: null,
    p_source_id: sourceId,
  });
  if (error || !object(data)) throw dataError(error, translate('sources.renameError'));
  return data;
}

export async function revokeSource(sourceId: string) {
  const { data, error } = await supabase.rpc('manage_source', {
    p_action: 'revoke',
    p_display_name: null,
    p_is_active: null,
    p_source_id: sourceId,
  });
  if (error || !object(data)) throw dataError(error, translate('sources.revokeError'));
  return data;
}

export async function setSourceActive(sourceId: string, isActive: boolean) {
  const { data, error } = await supabase.rpc('manage_source', {
    p_action: 'set_active',
    p_display_name: null,
    p_is_active: isActive,
    p_source_id: sourceId,
  });
  if (error || !object(data)) throw dataError(error, translate('sources.updateKeyError'));
  return data;
}

export function testSource(sourceId: string) {
  return invoke<{ notificationId: string; sourceId: string; pushAttempted: number; pushAccepted: number }>(
    'test-source',
    { sourceId },
    (value): value is { notificationId: string; sourceId: string; pushAttempted: number; pushAccepted: number } => (
      object(value)
      && typeof value.notificationId === 'string'
      && typeof value.sourceId === 'string'
      && typeof value.pushAttempted === 'number'
      && typeof value.pushAccepted === 'number'
    ),
  );
}

export function registerPushToken(token: string, deviceId: string, platform: NativePushPlatform) {
  return invoke<{ registered: boolean }>('register-push-token', {
    action: 'register',
    token,
    deviceId,
    platform,
  }, (value): value is { registered: boolean } => object(value) && value.registered === true);
}

export function unregisterPushDevice(deviceId: string) {
  return invoke<{ unregistered: boolean }>('register-push-token', {
    action: 'unregister',
    deviceId,
  }, (value): value is { unregistered: boolean } => object(value) && value.unregistered === true);
}

export function deleteAccount(expectedUserId: string) {
  return invoke<DeleteAccountResult>(
    'delete-account',
    { confirmation: 'DELETE', expectedUserId },
    (value): value is DeleteAccountResult => isDeleteAccountResult(value, expectedUserId),
  );
}
