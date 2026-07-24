import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushDevice } from './api';

const installationKey = 'zona.installation-id';
const onboardingPrefix = 'zona.push-onboarding-complete';
const healthPrefix = 'zona.push-health';

export type PushAvailability = 'registered' | 'not-granted' | 'denied' | 'simulator' | 'expo-go' | 'web' | 'unregistered' | 'error';

export type PushRegistrationHealth = {
  status: PushAvailability;
  updatedAt: string;
  lastRegisteredAt?: string;
  error?: string;
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(installationKey);
  if (existing) return existing;
  const next = Crypto.randomUUID();
  await AsyncStorage.setItem(installationKey, next);
  return next;
}

function onboardingKey(userId: string) {
  return `${onboardingPrefix}.${userId}`;
}

export async function isPushOnboardingComplete(userId: string) {
  return (await AsyncStorage.getItem(onboardingKey(userId))) === 'true';
}

export function markPushOnboardingComplete(userId: string) {
  return AsyncStorage.setItem(onboardingKey(userId), 'true');
}

function healthKey(userId: string) {
  return `${healthPrefix}.${userId}`;
}

async function saveHealth(userId: string, status: PushAvailability, error?: unknown) {
  const previous = await getPushRegistrationHealth(userId);
  const next: PushRegistrationHealth = {
    status,
    updatedAt: new Date().toISOString(),
    ...(status === 'registered' ? { lastRegisteredAt: new Date().toISOString() } : previous?.lastRegisteredAt ? { lastRegisteredAt: previous.lastRegisteredAt } : {}),
    ...(error ? { error: error instanceof Error ? error.message : 'Push registration failed.' } : {}),
  };
  await AsyncStorage.setItem(healthKey(userId), JSON.stringify(next));
  return next;
}

export async function getPushRegistrationHealth(userId: string): Promise<PushRegistrationHealth | null> {
  const raw = await AsyncStorage.getItem(healthKey(userId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PushRegistrationHealth>;
    if (typeof value.status !== 'string' || typeof value.updatedAt !== 'string') return null;
    return value as PushRegistrationHealth;
  } catch {
    return null;
  }
}

function cannotUseNativePush(): 'web' | 'expo-go' | 'simulator' | null {
  if (Platform.OS === 'web') return 'web';
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'expo-go';
  if (!Device.isDevice) return 'simulator';
  return null;
}

async function registerCurrentExpoToken() {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || projectId === 'REPLACE_WITH_EAS_PROJECT_ID') {
    throw new Error('Set expo.extra.eas.projectId in app.json before registering for push notifications.');
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(token, await installationId());
}

export async function enablePushNotifications(userId: string): Promise<'registered' | 'denied' | 'simulator' | 'expo-go' | 'web'> {
  const unavailable = cannotUseNativePush();
  if (unavailable) {
    await saveHealth(userId, unavailable);
    return unavailable;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    const permission = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      await saveHealth(userId, 'denied');
      return 'denied';
    }

    await registerCurrentExpoToken();
    await saveHealth(userId, 'registered');
    return 'registered';
  } catch (error) {
    await saveHealth(userId, 'error', error);
    throw error;
  }
}

export async function syncPushRegistration(userId: string): Promise<'registered' | 'not-granted' | 'simulator' | 'expo-go' | 'web'> {
  const unavailable = cannotUseNativePush();
  if (unavailable) {
    await saveHealth(userId, unavailable);
    return unavailable;
  }

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') {
      await saveHealth(userId, 'not-granted');
      return 'not-granted';
    }

    await registerCurrentExpoToken();
    await saveHealth(userId, 'registered');
    return 'registered';
  } catch (error) {
    await saveHealth(userId, 'error', error);
    throw error;
  }
}

export async function unregisterThisInstallation(userId?: string) {
  await unregisterPushDevice(await installationId());
  if (userId) await saveHealth(userId, 'unregistered');
}

export function addPushRegistrationRefreshListener(userId: string, onError?: (error: unknown) => void) {
  if (cannotUseNativePush()) return { remove() {} };

  let inFlight = false;
  let lastAt = 0;
  const minIntervalMs = 90_000;

  return Notifications.addPushTokenListener(() => {
    const now = Date.now();
    if (inFlight || now - lastAt < minIntervalMs) return;
    lastAt = now;
    inFlight = true;
    void syncPushRegistration(userId)
      .catch((error) => onError?.(error))
      .finally(() => {
        inFlight = false;
      });
  });
}
