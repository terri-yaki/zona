import * as Notifications from 'expo-notifications';
import { Stack, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { AppUpdateSync } from '@/components/AppUpdateSync';
import { PushRegistrationSync } from '@/components/PushRegistrationSync';
import { ensureNotificationSoundChannels } from '@/lib/notification-sounds';
import { savePendingNotificationId, takePendingNotificationId } from '@/lib/pending-notification';
import { isUuid } from '@/lib/validation';
import { colors, radius } from '@/theme';

function NotificationNavigation() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const sessionRef = useRef(session);
  const handledResponses = useRef(new Set<string>());

  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;

    async function open(response: Notifications.NotificationResponse | null) {
      if (!response || !active) return;
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.current.has(responseKey)) return;
      handledResponses.current.add(responseKey);
      const id = response?.notification.request.content.data?.notificationId;
      if (!isUuid(id)) return;
      if (sessionRef.current) router.push({ pathname: '/notification/[id]', params: { id } });
      else await savePendingNotificationId(id);
    }

    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch((error) => console.warn('Could not read the launch notification response.', error))
      .finally(() => Notifications.clearLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void open(response).finally(() => Notifications.clearLastNotificationResponse());
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (loading || !session) return;
    let active = true;
    void takePendingNotificationId().then((id) => {
      if (active && id) router.push({ pathname: '/notification/[id]', params: { id } });
    });
    return () => { active = false; };
  }, [loading, router, session]);

  return null;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (__DEV__ && error) console.error('[Zona ErrorBoundary]', error);

  return (
    <View style={styles.errorPage}>
      <Text style={styles.errorTitle}>Zona hit an unexpected problem</Text>
      <Text style={styles.errorMessage}>
        {__DEV__ ? message : 'Your data is safe. Try opening this screen again.'}
      </Text>
      {__DEV__ && stack ? (
        <ScrollView style={styles.errorStackBox} contentContainerStyle={styles.errorStackContent}>
          <Text selectable style={styles.errorStack}>{stack}</Text>
        </ScrollView>
      ) : null}
      <Pressable accessibilityRole="button" onPress={retry} style={styles.errorButton}>
        <Text style={styles.errorButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void ensureNotificationSoundChannels();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppUpdateSync />
          <PushRegistrationSync />
          <NotificationNavigation />
          <StatusBar style="dark" translucent={false} backgroundColor={colors.background} />
          <Stack screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text, fontSize: 17, fontWeight: '700' },
          }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="push-onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="notification/[id]" options={{ title: 'Notification' }} />
            <Stack.Screen name="source/new" options={{ title: 'New source', presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorPage: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 28 },
  errorTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  errorMessage: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10, maxWidth: 420, textAlign: 'center' },
  errorStackBox: { maxHeight: 220, marginTop: 14, maxWidth: 420, width: '100%' },
  errorStackContent: { paddingHorizontal: 4 },
  errorStack: { color: colors.mutedLight, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 11, lineHeight: 15 },
  errorButton: { backgroundColor: colors.primary, borderRadius: radius.medium, marginTop: 22, minHeight: 50, justifyContent: 'center', paddingHorizontal: 22 },
  errorButtonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
