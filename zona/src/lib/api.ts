import type { CreatedSource, DeleteAccountResult } from '@/types';

import { functionError } from './errors';
import { supabase } from './supabase';

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function invoke<T>(name: string, body: Record<string, unknown>, validate: (value: unknown) => value is T): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw await functionError(error, `The ${name} request failed.`);
  if (!validate(data)) throw new Error(`The ${name} response was invalid.`);
  return data;
}

export function createSource(displayName: string, hostname: string | null) {
  return invoke<CreatedSource>('create-source', { displayName, hostname }, (value): value is CreatedSource => (
    object(value)
    && typeof value.sourceId === 'string'
    && typeof value.displayName === 'string'
    && (value.hostname === null || typeof value.hostname === 'string')
    && typeof value.token === 'string'
    && typeof value.ingestUrl === 'string'
  ));
}

export function renameSource(sourceId: string, displayName: string) {
  return invoke<{ sourceId: string; displayName: string }>('manage-source', {
    action: 'rename',
    sourceId,
    displayName,
  }, (value): value is { sourceId: string; displayName: string } => object(value) && typeof value.sourceId === 'string' && typeof value.displayName === 'string');
}

export function revokeSource(sourceId: string) {
  return invoke<{ sourceId: string; revokedAt: string }>('manage-source', {
    action: 'revoke',
    sourceId,
  }, (value): value is { sourceId: string; revokedAt: string } => object(value) && typeof value.sourceId === 'string' && typeof value.revokedAt === 'string');
}

export function registerPushToken(token: string, deviceId: string) {
  return invoke<{ registered: boolean }>('register-push-token', {
    action: 'register',
    token,
    deviceId,
    platform: 'ios',
  }, (value): value is { registered: boolean } => object(value) && value.registered === true);
}

export function unregisterPushDevice(deviceId: string) {
  return invoke<{ unregistered: boolean }>('register-push-token', {
    action: 'unregister',
    deviceId,
  }, (value): value is { unregistered: boolean } => object(value) && value.unregistered === true);
}

export function deleteAccount() {
  return invoke<DeleteAccountResult>('delete-account', { confirmation: 'DELETE' }, (value): value is DeleteAccountResult => (
    object(value) && value.deleted === true
  ));
}
