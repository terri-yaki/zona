import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { translate } from '@/i18n';

export type UpdateCheckResult =
  | { status: 'disabled' }
  | { status: 'up-to-date' }
  | { status: 'available'; message?: string }
  | { status: 'error'; message: string };

/** OTA is only meaningful in release/preview binaries, not Metro/dev clients. */
export function updatesEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  if (__DEV__) return false;
  return Updates.isEnabled;
}

/**
 * Check Expo for a published update on this binary's channel.
 * Does not download or reload.
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!updatesEnabled()) return { status: 'disabled' };
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return { status: 'up-to-date' };
    return {
      status: 'available',
      message: result.manifest && 'id' in result.manifest
        ? String((result.manifest as { id?: string }).id ?? '')
        : undefined,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : translate('updates.checkError'),
    };
  }
}

/**
 * Download the pending update and reload into it.
 */
export async function installAppUpdate(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!updatesEnabled()) return { ok: false, message: translate('updates.disabled') };
  try {
    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) return { ok: false, message: translate('updates.noneDownloaded') };
    await Updates.reloadAsync();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : translate('updates.installFallback'),
    };
  }
}

/**
 * Prompt the user when an OTA update is available (preview/production binaries).
 * Safe to call on launch; no-ops in __DEV__ and when updates are disabled.
 */
export async function promptForAppUpdateIfAvailable(options?: { silentWhenCurrent?: boolean }) {
  const check = await checkForAppUpdate();
  if (check.status === 'disabled' || check.status === 'up-to-date') {
    if (!options?.silentWhenCurrent && check.status === 'up-to-date') {
      // Launch path stays quiet when already current.
    }
    return check;
  }
  if (check.status === 'error') {
    console.warn('App update check failed.', check.message);
    return check;
  }

  return new Promise<UpdateCheckResult>((resolve) => {
    Alert.alert(
      translate('updates.available'),
      translate('updates.availableBody'),
      [
        {
          text: translate('common.later'),
          style: 'cancel',
          onPress: () => resolve(check),
        },
        {
          text: translate('common.install'),
          onPress: () => {
            void installAppUpdate().then((result) => {
              if (!result.ok) {
                Alert.alert(translate('updates.installError'), result.message);
              }
              resolve(check);
            });
          },
        },
      ],
    );
  });
}

/** Manual check from Settings — always tells the user the outcome. */
export async function checkForAppUpdateInteractive() {
  const check = await checkForAppUpdate();
  if (check.status === 'disabled') {
    Alert.alert(
      translate('updates.unavailable'),
      translate('updates.unavailableBody'),
    );
    return;
  }
  if (check.status === 'error') {
    Alert.alert(translate('updates.checkError'), check.message);
    return;
  }
  if (check.status === 'up-to-date') {
    Alert.alert(translate('updates.current'), translate('updates.currentBody'));
    return;
  }

  Alert.alert(
    translate('updates.available'),
    translate('updates.availableShortBody'),
    [
      { text: translate('common.cancel'), style: 'cancel' },
      {
        text: translate('common.install'),
        onPress: () => {
          void installAppUpdate().then((result) => {
            if (!result.ok) Alert.alert(translate('updates.installError'), result.message);
          });
        },
      },
    ],
  );
}
