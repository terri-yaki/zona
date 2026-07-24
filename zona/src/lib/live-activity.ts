import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getAppOptions, updateAppOptions } from '@/data/options';
import { colors } from '@/theme';

/** Legacy local-only preference from early Live Status builds. */
const LEGACY_ENABLED_KEY = 'zona.live_activity_enabled';
const ACTIVITY_ID_KEY = 'zona.live_activity_id';
const SESSION_END_KEY = 'zona.live_activity_session_end';

/** Apple Live Activities typically expire around 8 hours. */
const SESSION_MS = 8 * 60 * 60 * 1000;

export type ZonaLiveActivitySnapshot = {
  unreadCount: number;
  latestTitle: string | null;
  latestSource: string | null;
  latestId: string | null;
};

type LiveActivityModule = typeof import('expo-live-activity');

let modulePromise: Promise<LiveActivityModule | null> | null = null;

function isIosDevice() {
  return Platform.OS === 'ios';
}

async function loadModule(): Promise<LiveActivityModule | null> {
  if (!isIosDevice()) return null;
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
  if (!enabled) await stopLiveActivity('Live Status off');
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

async function getOrCreateSessionEnd(reset = false): Promise<number> {
  if (!reset) {
    try {
      const stored = await AsyncStorage.getItem(SESSION_END_KEY);
      if (stored) {
        const end = Number(stored);
        if (Number.isFinite(end) && end > Date.now() + 60_000) return end;
      }
    } catch {
      // fall through
    }
  }
  const end = Date.now() + SESSION_MS;
  await AsyncStorage.setItem(SESSION_END_KEY, String(end));
  return end;
}

function waitingLabel(count: number) {
  if (count <= 0) return 'All clear';
  if (count === 1) return '1 waiting';
  return `${count} waiting`;
}

function buildState(snapshot: ZonaLiveActivitySnapshot, sessionEnd: number) {
  const unread = Math.max(0, snapshot.unreadCount);
  const title = (snapshot.latestTitle?.trim() || waitingLabel(unread)).slice(0, 80);
  const source = snapshot.latestSource?.trim() || 'Zona';
  const subtitle =
    unread > 0
      ? `${source} · ${waitingLabel(unread)}`
      : 'Everything is quiet';

  return {
    title,
    subtitle,
    progressBar: { date: sessionEnd },
    // Bundled from assets/liveActivity/icon.png (resized from assets/icon.png; keep ≤4 KiB).
    imageName: 'icon',
    dynamicIslandImageName: 'icon',
  };
}

function buildConfig(snapshot: ZonaLiveActivitySnapshot) {
  const deepLinkUrl = snapshot.latestId
    ? `/notification/${snapshot.latestId}`
    : '/';

  return {
    backgroundColor: colors.background,
    titleColor: colors.text,
    subtitleColor: colors.muted,
    progressViewTint: colors.primary,
    progressViewLabelColor: colors.mutedLight,
    deepLinkUrl,
    timerType: 'circular' as const,
    padding: { horizontal: 16, top: 14, bottom: 14 },
    imagePosition: 'left' as const,
    imageAlign: 'center' as const,
    imageSize: { width: 44, height: 44 },
    contentFit: 'contain' as const,
  };
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
    await stopLiveActivity('All clear');
    return;
  }

  const LiveActivity = await loadModule();
  if (!LiveActivity) return;

  try {
    const sessionEnd = await getOrCreateSessionEnd(false);
    const state = buildState(snapshot, sessionEnd);
    const existingId = await getStoredActivityId();

    if (existingId) {
      try {
        LiveActivity.updateActivity(existingId, state);
        return;
      } catch (error) {
        console.warn('Could not update Live Activity; starting a new one.', error);
        await setStoredActivityId(null);
      }
    }

    const freshEnd = await getOrCreateSessionEnd(true);
    const freshState = buildState(snapshot, freshEnd);
    const id = LiveActivity.startActivity(freshState, buildConfig(snapshot));
    if (id) await setStoredActivityId(id);
  } catch (error) {
    console.warn('Could not sync Live Activity.', error);
  }
}

export async function stopLiveActivity(finalTitle = 'All clear'): Promise<void> {
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
      imageName: 'icon',
      dynamicIslandImageName: 'icon',
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
  const mod = await loadModule();
  if (!mod?.startActivity) return 'native-missing';
  return 'ready';
}

export function liveActivityCapabilityLabel(status: LiveActivityCapability): string {
  switch (status) {
    case 'ready':
      return 'This build can show Live Status on the Lock Screen and Dynamic Island when unread alerts exist.';
    case 'expo-go':
      return 'Expo Go cannot show Live Activities. Install a Zona preview or production IPA built after Live Status was added.';
    case 'native-missing':
      return 'This installed app is missing the Live Activity native target. Install a new preview IPA (OTA is not enough). iPhone Settings → Zona will not list Live Activities until then.';
    default:
      return 'Live Status is only available on iPhone.';
  }
}
