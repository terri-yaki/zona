import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const nativeStorage: AuthStorage = {
  async getItem(key) {
    const secureValue = await SecureStore.getItemAsync(key, secureOptions);
    if (secureValue !== null) return secureValue;

    // One-time migration from the prototype's unencrypted AsyncStorage adapter.
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue !== null) {
      await SecureStore.setItemAsync(key, legacyValue, secureOptions);
      await AsyncStorage.removeItem(key);
    }
    return legacyValue;
  },
  async removeItem(key) {
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      AsyncStorage.removeItem(key),
    ]);
  },
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value, secureOptions);
    await AsyncStorage.removeItem(key);
  },
};

export const authStorage: AuthStorage = Platform.OS === 'web' ? AsyncStorage : nativeStorage;
