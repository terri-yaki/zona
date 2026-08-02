import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { translate } from '@/i18n';

import { getAppOptions, updateAppOptions } from '@/data/options';
import {
  buildLiveActivityConfig,
  buildLiveActivityState,
  LIVE_ACTIVITY_SYMBOL,
  liveActivityPalette,
  type ZonaLiveActivitySnapshot,
} from '@/lib/live-activity-presentation';
import { getActiveThemePreset, getActiveThemePresetId } from '@/theme-preference';

export type { ZonaLiveActivitySnapshot } from '@/lib/live-activity-presentation';

/** Legacy local-only preference from early Live Status builds. */
const LEGACY_ENABLED_KEY = 'zona.live_activity_enabled';
const ACTIVITY_ID_KEY = 'zona.live_activity_id';
/** Removed session-timer bookkeeping; kept only to scrub stale values. */
const SESSION_END_KEY = 'zona.live_activity_session_end';
/**
 * Bump when the activity presentation changes in a way `updateActivity`
 * cannot migrate (attributes are fixed at start). A mismatch forces
 * stop + start so existing activities pick up the new design once.
 * The stored tag also carries the theme preset id, so switching themes
 * restarts the activity with the picked palette.
 */
const DESIGN_VERSION_KEY = 'zona.live_activity_design_version';
const CURRENT_DESIGN_VERSION = '4';

function currentDesignTag(): string {
  return `${CURRENT_DESIGN_VERSION}:${getActiveThemePresetId()}`;
}

type LiveActivityModule = typeof import('expo-live-activity');

let modulePromise: Promise<LiveActivityModule | null> | null = null;

function isIosDevice() {
  return Platform.OS === 'ios';
}

function hasNativeModule() {
  return Boolean(requireOptionalNativeModule('ExpoLiveActivity'));
}

async function loadModule(): Promise<LiveActivityModule | null> {
  if (!isIosDevice() || !hasNativeModule()) return null;
  if (!modulePromise) {
    modulePromise = import('expo-live-activity')
      .then((mod) => mod)
      .catch((error) => {
        console.warn('Live Activity native module is unavailable.', error);
        return null;
      });
  }
  return modulePromise;
}

/**
 * One-time migrate AsyncStorage Live Status flag into app_options.
 * Safe no-op when already migrated or when DB is already enabled.
 */
export async function migrateLegacyLiveActivityPreference(userId: string): Promise<boolean> {
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_ENABLED_KEY);
    if (legacy !== '1') return false;

    const options = await getAppOptions(userId);
    if (!options.live_activity_enabled) {
      await updateAppOptions(userId, { live_activity_enabled: true });
    }
    await AsyncStorage.removeItem(LEGACY_ENABLED_KEY);
    return true;
  } catch (error) {
    console.warn('Could not migrate Live Status preference.', error);
    return false;
  }
}

export async function getLiveActivityEnabled(userId: string): Promise<boolean> {
  try {
    await migrateLegacyLiveActivityPreference(userId);
    const options = await getAppOptions(userId);
    return Boolean(options.live_activity_enabled);
  } catch {
    return false;
  }
}

export async function setLiveActivityEnabled(userId: string, enabled: boolean): Promise<void> {
  await updateAppOptions(userId, { live_activity_enabled: enabled });
  try {
    await AsyncStorage.removeItem(LEGACY_ENABLED_KEY);
  } catch {
    // ignore
  }
  if (!enabled) await stopLiveActivity(translate('live.allClear'));
}

async function getStoredActivityId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVITY_ID_KEY);
  } catch {
    return null;
  }
}

async function setStoredActivityId(id: string | null): Promise<void> {
  if (id) await AsyncStorage.setItem(ACTIVITY_ID_KEY, id);
  else await AsyncStorage.removeItem(ACTIVITY_ID_KEY);
}

/**
 * Mirror inbox unread state into a single Live Activity.
 * No-ops on non-iOS, when disabled, or when the native module is missing.
 */
export async function syncLiveActivity(
  userId: string,
  snapshot: ZonaLiveActivitySnapshot,
): Promise<void> {
  if (!isIosDevice()) return;

  const enabled = await getLiveActivityEnabled(userId);
  if (!enabled) {
    await stopLiveActivity();
    return;
  }

  if (snapshot.unreadCount <= 0) {
    await stopLiveActivity(translate('live.allClear'));
    return;
  }

  const LiveActivity = await loadModule();
  if (!LiveActivity) return;

  try {
    const state = buildLiveActivityState(snapshot);
    const existingId = await getStoredActivityId();
    const designTag = await AsyncStorage.getItem(DESIGN_VERSION_KEY);

    if (existingId && designTag === currentDesignTag()) {
      try {
        LiveActivity.updateActivity(existingId, state);
        return;
      } catch (error) {
        console.warn('Could not update Live Activity; starting a new one.', error);
        await setStoredActivityId(null);
      }
    }

    // Design or theme mismatch (or missing activity): restart so the
    // attributes and the picked theme palette apply.
    if (existingId) await stopLiveActivity(translate('settings.liveStatus'));

    const id = LiveActivity.startActivity(state, buildLiveActivityConfig(snapshot, liveActivityPalette(getActiveThemePreset())));
    if (id) {
      await setStoredActivityId(id);
      await AsyncStorage.setItem(DESIGN_VERSION_KEY, currentDesignTag());
    }
  } catch (error) {
    console.warn('Could not sync Live Activity.', error);
  }
}

export async function stopLiveActivity(finalTitle = translate('live.allClear')): Promise<void> {
  if (!isIosDevice()) {
    await setStoredActivityId(null);
    return;
  }

  const existingId = await getStoredActivityId();
  await setStoredActivityId(null);
  try {
    await AsyncStorage.removeItem(SESSION_END_KEY);
  } catch {
    // ignore
  }

  if (!existingId) return;

  const LiveActivity = await loadModule();
  if (!LiveActivity) return;

  try {
    LiveActivity.stopActivity(existingId, {
      title: finalTitle,
      subtitle: 'Zona',
      imageName: LIVE_ACTIVITY_SYMBOL,
      dynamicIslandImageName: LIVE_ACTIVITY_SYMBOL,
    });
  } catch (error) {
    console.warn('Could not stop Live Activity.', error);
  }
}

/**
 * Clear stored activity id when the user dismisses the system Live Activity UI
 * so the next sync can start a fresh one if still needed.
 */
export async function attachLiveActivityStateListener(): Promise<() => void> {
  if (!isIosDevice()) return () => {};
  const LiveActivity = await loadModule();
  if (!LiveActivity?.addActivityUpdatesListener) return () => {};

  try {
    const sub = LiveActivity.addActivityUpdatesListener(async (event) => {
      if (event.activityState === 'dismissed' || event.activityState === 'ended') {
        const stored = await getStoredActivityId();
        if (stored && stored === event.activityID) {
          await setStoredActivityId(null);
          try {
            await AsyncStorage.removeItem(SESSION_END_KEY);
          } catch {
            // ignore
          }
        }
      }
    });

    return () => {
      sub?.remove();
    };
  } catch (error) {
    console.warn('Live Activity state listener is unavailable in this build.', error);
    return () => {};
  }
}

/** True when this platform can attempt Live Activities (iOS only; not Expo Go guarantee). */
export function liveActivityPlatformSupported() {
  return isIosDevice();
}

export type LiveActivityCapability =
  | 'ready'
  | 'expo-go'
  | 'native-missing'
  | 'unsupported';

/**
 * Whether this *installed binary* can actually start a Live Activity.
 * The in-app toggle can still save a preference before a native rebuild ships.
 */
export async function getLiveActivityCapability(): Promise<LiveActivityCapability> {
  if (!isIosDevice()) return 'unsupported';
  // Expo Go never includes the Live Activity widget extension.
  if (Constants.appOwnership === 'expo') return 'expo-go';
  if (!hasNativeModule()) return 'native-missing';
  const mod = await loadModule();
  if (!mod?.startActivity) return 'native-missing';
  return 'ready';
}

export function liveActivityCapabilityLabel(status: LiveActivityCapability): string {
  switch (status) {
    case 'ready':
      return translate('live.capability.ready');
    case 'expo-go':
      return translate('live.capability.expoGo');
    case 'native-missing':
      return translate('live.capability.nativeMissing');
    default:
      return translate('live.capability.unsupported');
  }
}
