import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type AuthIntent = 'link_method' | 'protect_guest' | 'sign_in' | 'sign_up';
export type AuthProviderName = 'apple' | 'github' | 'google';

export type AuthTransaction = {
  confirmation?: 'signup';
  createdAt: number;
  email: string | null;
  expiresAt: number;
  expectedUserId: string | null;
  id: string;
  intent: AuthIntent;
  provider: AuthProviderName | 'email';
};

const storageKey = 'zona.auth-transaction.v1';
const lifetimeMs = 10 * 60 * 1_000;

async function readRaw() {
  return Platform.OS === 'web'
    ? AsyncStorage.getItem(storageKey)
    : SecureStore.getItemAsync(storageKey);
}

async function writeRaw(value: string | null) {
  if (Platform.OS === 'web') {
    if (value === null) await AsyncStorage.removeItem(storageKey);
    else await AsyncStorage.setItem(storageKey, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(storageKey);
  else await SecureStore.setItemAsync(storageKey, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export function isAuthIntent(value: unknown): value is AuthIntent {
  return value === 'link_method'
    || value === 'protect_guest'
    || value === 'sign_in'
    || value === 'sign_up';
}

export async function beginAuthTransaction(input: {
  confirmation?: 'signup';
  email?: string | null;
  expectedUserId?: string | null;
  intent: AuthIntent;
  provider: AuthProviderName | 'email';
}) {
  const now = Date.now();
  const transaction: AuthTransaction = {
    confirmation: input.confirmation,
    createdAt: now,
    email: input.email ?? null,
    expectedUserId: input.expectedUserId ?? null,
    expiresAt: now + lifetimeMs,
    id: Crypto.randomUUID(),
    intent: input.intent,
    provider: input.provider,
  };
  await writeRaw(JSON.stringify(transaction));
  return transaction;
}

export async function getAuthTransaction(id: string) {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AuthTransaction>;
    if (value.id !== id
      || !isAuthIntent(value.intent)
      || typeof value.expiresAt !== 'number'
      || value.expiresAt <= Date.now()
      || typeof value.provider !== 'string') {
      await writeRaw(null);
      return null;
    }
    return value as AuthTransaction;
  } catch {
    await writeRaw(null);
    return null;
  }
}

export async function consumeAuthTransaction(id: string) {
  const transaction = await getAuthTransaction(id);
  if (!transaction) return null;
  await writeRaw(null);
  return transaction;
}

export async function cancelAuthTransaction(id?: string) {
  if (!id) return writeRaw(null);
  const current = await getAuthTransaction(id);
  if (current) await writeRaw(null);
}
