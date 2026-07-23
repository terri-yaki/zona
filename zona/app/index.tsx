import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import { isPushOnboardingComplete } from '@/lib/push';
import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { session, loading } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    if (!session) {
      setOnboarded(null);
      return () => { current = false; };
    }
    isPushOnboardingComplete(session.user.id).then((value) => {
      if (current) setOnboarded(value);
    });
    return () => { current = false; };
  }, [session]);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  if (onboarded === null) return <LoadingScreen />;
  if (!onboarded) return <Redirect href="/push-onboarding" />;
  return <Redirect href="/(tabs)" />;
}
