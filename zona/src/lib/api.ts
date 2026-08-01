import type { CreatedSource, CreatedSourceAccessKey, DeleteAccountResult, ManagedSourceAccessKey } from '@/types';

import { dataError, functionError } from './errors';
import { supabase } from './supabase';
import { isDeleteAccountResult } from './validation';
import type { NativePushPlatform } from './push-platform';
import { translate } from '@/i18n';
import { recordClientErrorOnce, recordClientEvent } from './client-telemetry';

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function invoke<T>(name: string, body: Record<string, unknown>, validate: (value: unknown) => value is T): Promise<T> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (error) throw await functionError(error, translate('error.default'));
    if (!validate(data)) throw new Error(translate('error.default'));
    recordClientEvent('api.request_succeeded', 'info', { function: name, durationMs: Date.now() - startedAt });
    return data;
  } catch (error) {
    recordClientErrorOnce('api.request_failed', error, { function: name, durationMs: Date.now() - startedAt });
    throw error;
  }
}

export async function createSource(displayName: string, hostname: string | null): Promise<CreatedSource> {
  return invoke<CreatedSource>('create-source', { displayName, hostname }, isCreatedSource);
}

export function createSourceAccessKey(sourceId: string, keyLabel: string) {
  return invoke<CreatedSourceAccessKey>(
    'create-source-key',
    { sourceId, keyLabel },
    isCreatedSourceAccessKey,
  );
}

export function manageSourceAccessKey(
  accessKeyId: string,
  action: 'rename' | 'set_active' | 'revoke',
  options: { keyLabel?: string; isActive?: boolean } = {},
) {
  return invoke<ManagedSourceAccessKey>(
    'manage-source-key',
    { accessKeyId, action, ...options },
    isManagedSourceAccessKey,
  );
}

function isCreatedSourceAccessKey(value: unknown): value is CreatedSourceAccessKey {
  return object(value)
    && typeof value.sourceId === 'string'
    && typeof value.accessKeyId === 'string'
    && typeof value.keyLabel === 'string'
    && typeof value.token === 'string'
    && typeof value.ingestUrl === 'string';
}

function isCreatedSource(value: unknown): value is CreatedSource {
  return object(value)
    && typeof value.sourceId === 'string'
    && typeof value.accessKeyId === 'string'
    && typeof value.keyLabel === 'string'
    && typeof value.token === 'string'
    && typeof value.ingestUrl === 'string'
    && typeof value.displayName === 'string'
    && (typeof value.hostname === 'string' || value.hostname === null);
}

function isManagedSourceAccessKey(value: unknown): value is ManagedSourceAccessKey {
  return object(value)
    && typeof value.sourceId === 'string'
    && typeof value.accessKeyId === 'string'
    && typeof value.keyLabel === 'string'
    && typeof value.isActive === 'boolean'
    && (typeof value.revokedAt === 'string' || value.revokedAt === null);
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

export function deleteAccount(expectedUserId: string, reauthGrant?: string) {
  return invoke<DeleteAccountResult>(
    'delete-account',
    { confirmation: 'DELETE', expectedUserId, ...(reauthGrant ? { reauthGrant } : {}) },
    (value): value is DeleteAccountResult => isDeleteAccountResult(value, expectedUserId),
  );
}
