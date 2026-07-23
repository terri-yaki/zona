import AsyncStorage from '@react-native-async-storage/async-storage';

import { isUuid } from './validation';

const pendingNotificationKey = 'zona.pending-notification-id';

export async function savePendingNotificationId(id: string) {
  if (!isUuid(id)) return;
  await AsyncStorage.setItem(pendingNotificationKey, id);
}

export async function takePendingNotificationId() {
  const id = await AsyncStorage.getItem(pendingNotificationKey);
  await AsyncStorage.removeItem(pendingNotificationKey);
  return isUuid(id) ? id : null;
}
