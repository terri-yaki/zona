import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';

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
      message: error instanceof Error ? error.message : 'Update check failed.',
    };
  }
}

/**
 * Download the pending update and reload into it.
 */
export async function installAppUpdate(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!updatesEnabled()) return { ok: false, message: 'Updates are not enabled in this build.' };
  try {
    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) return { ok: false, message: 'No new update was downloaded.' };
    await Updates.reloadAsync();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The update could not be installed.',
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
      'Update available',
      'A new version of Zona is ready. Install it now?',
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: () => resolve(check),
        },
        {
          text: 'Install',
          onPress: () => {
            void installAppUpdate().then((result) => {
              if (!result.ok) {
                Alert.alert('Could not install update', result.message);
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
      'Updates unavailable',
      'Over-the-air updates only work in preview or production installs, not in Expo Go or a development Metro session.',
    );
    return;
  }
  if (check.status === 'error') {
    Alert.alert('Could not check for updates', check.message);
    return;
  }
  if (check.status === 'up-to-date') {
    Alert.alert('You are up to date', 'This install already has the latest published update for its channel.');
    return;
  }

  Alert.alert(
    'Update available',
    'Install the latest Zona update now?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Install',
        onPress: () => {
          void installAppUpdate().then((result) => {
            if (!result.ok) Alert.alert('Could not install update', result.message);
          });
        },
      },
    ],
  );
}
