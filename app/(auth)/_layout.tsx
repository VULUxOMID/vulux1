import { Redirect, Stack, useSegments } from 'expo-router';

import { useAuth as useSessionAuth } from '../../src/auth/spacetimeSession';

export default function AuthLayout() {
  const segments = useSegments();
  const { isLoaded, hasSession, needsVerification } = useSessionAuth();

  if (hasSession && needsVerification && segments[1] !== 'verify-email') {
    return <Redirect href="/(auth)/verify-email" />;
  }

  if (hasSession) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
