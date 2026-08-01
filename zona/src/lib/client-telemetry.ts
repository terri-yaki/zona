import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getInstallationId } from './installation';
import { supabase } from './supabase';

type ClientLogLevel = 'debug' | 'info' | 'warning' | 'error';
type ClientContext = Record<string, boolean | number | string | null>;

let queue = Promise.resolve();
const errorFingerprints = new Set<string>();

function buildNumber(): number {
  const value = Number.parseInt(Constants.nativeBuildVersion ?? '0', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeMessage(value: unknown): string | null {
  if (value instanceof Error) return value.message.slice(0, 500);
  return typeof value === 'string' ? value.slice(0, 500) : null;
}

export function recordClientEvent(
  eventName: string,
  level: ClientLogLevel = 'info',
  context: ClientContext = {},
  message?: unknown,
): void {
  queue = queue.then(async () => {
    try {
      const { error } = await supabase.rpc('record_client_event', {
        p_installation_id: await getInstallationId(),
        p_event_name: eventName,
        p_level: level,
        p_message: safeMessage(message),
        p_app_version: Constants.expoConfig?.version ?? '0.0.0',
        p_build_number: buildNumber(),
        p_platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
        p_context: context,
      });
      if (error && __DEV__) console.warn('Could not record client telemetry.', error.message);
    } catch (error) {
      if (__DEV__) console.warn('Client telemetry unavailable.', error);
    }
  });
}

export function recordClientErrorOnce(eventName: string, error: unknown, context: ClientContext = {}): void {
  const message = safeMessage(error) ?? 'Unknown client error';
  const fingerprint = `${eventName}:${message}`;
  if (errorFingerprints.has(fingerprint)) return;
  errorFingerprints.add(fingerprint);
  if (errorFingerprints.size > 100) errorFingerprints.delete(errorFingerprints.values().next().value ?? '');
  recordClientEvent(eventName, 'error', {
    ...context,
    errorName: error instanceof Error ? error.name : typeof error,
  }, message);
}
