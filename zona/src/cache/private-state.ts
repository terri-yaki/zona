import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearCachedContent } from './session';
import { stopLiveActivity } from '@/lib/live-activity';
import { clearPendingNotificationId } from '@/lib/pending-notification';
import { clearPushUserState } from '@/lib/push';

const legacyRuntimePrefix = 'zona.runtime-config.v1.';
const announcementPrefix = 'zona.runtime-announcement.dismissed.';

export async function clearPrivateUserState(ownerUserId: string) {
  await clearCachedContent(ownerUserId).catch((error) => {
    console.warn('Could not clear cached content.', error);
  });
  let keys: readonly string[] = [];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch (error) {
    console.warn('Could not inspect private app storage.', error);
  }
  const legacyKeys = keys.filter((key) => (
    key.startsWith(`${legacyRuntimePrefix}${ownerUserId}.`)
    || key.startsWith(`${announcementPrefix}${ownerUserId}.`)
  ));
  await Promise.allSettled([
    clearPendingNotificationId(),
    clearPushUserState(ownerUserId),
    stopLiveActivity(),
    legacyKeys.length ? AsyncStorage.multiRemove(legacyKeys) : Promise.resolve(),
  ]);
}
