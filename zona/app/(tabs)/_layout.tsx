import { Redirect, Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

function TabIcon({ name, color }: { name: 'tray.full' | 'desktopcomputer' | 'gearshape'; color: ColorValue }) {
  return <AppIcon color={color} name={name} size={21} />;
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Tabs screenOptions={{
      headerShadowVisible: false,
      headerStyle: { backgroundColor: colors.background },
      headerTitleStyle: { color: colors.text, fontSize: 18, fontWeight: '700' },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.mutedLight,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 1 },
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 82, paddingBottom: 21, paddingTop: 8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Inbox', tabBarIcon: ({ color }) => <TabIcon color={color} name="tray.full" /> }} />
      <Tabs.Screen name="sources" options={{ lazy: false, title: 'API Keys', tabBarIcon: ({ color }) => <TabIcon color={color} name="desktopcomputer" /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon color={color} name="gearshape" /> }} />
    </Tabs>
  );
}
