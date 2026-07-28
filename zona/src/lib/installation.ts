import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const installationKey = 'zona.installation-id';

export async function getInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(installationKey);
  if (existing) return existing;
  const next = Crypto.randomUUID();
  await AsyncStorage.setItem(installationKey, next);
  return next;
}
