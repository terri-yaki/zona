import type { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import { getInstallationId } from './installation';
import { supabase } from './supabase';

export type AccountTransferPreview = {
  activeKeys: number;
  attachments: number;
  keyLimitConflict: boolean;
  phoneLimitConflict: boolean;
  sourceLimitConflict: boolean;
  destinationKeepsPreferences: boolean;
  notifications: number;
  sources: number;
};

export type AccountTransfer = {
  expiresAt: string;
  preview: AccountTransferPreview;
  status: string;
  transferId: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function parseAccountTransferResponse(value: unknown): AccountTransfer {
  if (!record(value) || typeof value.transferId !== 'string' || typeof value.status !== 'string'
    || typeof value.expiresAt !== 'string' || !record(value.preview)) {
    throw new Error('INVALID_TRANSFER_RESPONSE');
  }
  return {
    expiresAt: value.expiresAt,
    status: value.status,
    transferId: value.transferId,
    preview: {
      activeKeys: count(value.preview.activeKeys),
      attachments: count(value.preview.attachments),
      destinationKeepsPreferences: value.preview.destinationKeepsPreferences === true,
      keyLimitConflict: value.preview.keyLimitConflict === true,
      phoneLimitConflict: value.preview.phoneLimitConflict === true,
      sourceLimitConflict: value.preview.sourceLimitConflict === true,
      notifications: count(value.preview.notifications),
      sources: count(value.preview.sources),
    },
  };
}

async function invokeTransfer(body: Record<string, unknown>, destination: Session) {
  const { data, error } = await supabase.functions.invoke('account-transfer', {
    body,
    headers: { 'x-destination-token': `Bearer ${destination.access_token}` },
  });
  if (error) throw error;
  return data;
}

export async function previewGuestTransfer(destination: Session) {
  const data = await invokeTransfer({
    action: 'preview',
    idempotencyKey: `guest-transfer:${Crypto.randomUUID()}`,
  }, destination);
  return parseAccountTransferResponse(data);
}

export async function commitGuestTransfer(transferId: string, destination: Session) {
  const installationId = await getInstallationId();
  const data = await invokeTransfer({
    action: 'commit',
    transferId,
    installationId,
  }, destination);
  if (!record(data) || data.status !== 'completed') throw new Error('INVALID_TRANSFER_RESPONSE');
  return data;
}

export async function cancelGuestTransfer(transferId: string) {
  const { error } = await supabase.functions.invoke('account-transfer', {
    body: { action: 'cancel', transferId },
  });
  if (error) throw error;
}
