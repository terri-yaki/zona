import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const installationKey = 'zona.installation-id';
const installationOwnerKey = 'zona.installation-owner';
let claimInFlight: { promise: Promise<string>; userId: string } | null = null;

export async function getInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(installationKey);
  if (existing) return existing;
  const next = Crypto.randomUUID();
  await AsyncStorage.setItem(installationKey, next);
  return next;
}

/** Bind one stable physical-install identity to the active authenticated user. */
export function claimInstallationForUser(userId: string): Promise<string> {
  if (claimInFlight?.userId === userId) return claimInFlight.promise;
  if (claimInFlight) return claimInFlight.promise.then(() => claimInstallationForUser(userId));
  const promise = (async () => {
    const existingId = await AsyncStorage.getItem(installationKey);
    const installationId = existingId ?? Crypto.randomUUID();
    await AsyncStorage.multiSet([
      [installationKey, installationId],
      [installationOwnerKey, userId],
    ]);
    return installationId;
  })();
  claimInFlight = { promise, userId };
  return promise.finally(() => {
    if (claimInFlight?.promise === promise) claimInFlight = null;
  });
}
