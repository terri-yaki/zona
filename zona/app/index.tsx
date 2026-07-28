import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import { isPushOnboardingComplete } from '@/lib/push';
import { useAuth } from '@/providers/AuthProvider';
import { useRuntimeConfig } from '@/providers/RuntimeConfigProvider';

export default function Index() {
  const { session, loading } = useAuth();
  const { isEnabled, isVisible } = useRuntimeConfig();
  const [onboarded, setOnboarded] = useState<{ userId: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const userId = session.user.id;
    isPushOnboardingComplete(userId).then((value) => {
      if (current) setOnboarded({ userId, value });
    });
    return () => { current = false; };
  }, [session]);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!isVisible('onboarding.push') || !isEnabled('onboarding.push')) return <Redirect href="/(tabs)" />;
  if (onboarded?.userId !== session.user.id) return <LoadingScreen />;
  if (!onboarded.value) return <Redirect href="/push-onboarding" />;
  return <Redirect href="/(tabs)" />;
}
