import { Redirect, Stack, useSegments } from 'expo-router';

import { useAuth as useSessionAuth } from '../../src/auth/clerkSession';
import { useUserProfile } from '../../src/context/UserProfileContext';
import { AuthLoadingScreen } from '../../src/features/auth/AuthLoadingScreen';
import {
  isVuluOnboardingComplete,
  shouldSkipVuluOnboardingForQa,
} from '../../src/features/auth/onboardingState';

export default function AuthLayout() {
  const segments = useSegments();
  const activeRoute = segments[1] ?? null;
  const { isLoaded, hasSession, isSignedIn, needsVerification } = useSessionAuth();
  const { isProfileReady, userProfile } = useUserProfile();
  const hasActiveSession = isSignedIn;
  const shouldSkipOnboarding = shouldSkipVuluOnboardingForQa();
  const needsOnboarding =
    hasActiveSession && !shouldSkipOnboarding && !isVuluOnboardingComplete(userProfile);

  if (!isLoaded) {
    return (
      <AuthLoadingScreen
        title="Opening Vulu"
        detail="Checking your session."
      />
    );
  }

  if (hasSession && needsVerification && activeRoute !== 'verify-email') {
    return <Redirect href="/(auth)/verify-email" />;
  }

  if (activeRoute === 'verify-email' && needsVerification) {
    return <Stack screenOptions={{ headerShown: false }} />;
  }

  if (activeRoute === 'update-password' || activeRoute === 'create-password') {
    return <Stack screenOptions={{ headerShown: false }} />;
  }

  if (hasActiveSession && !isProfileReady) {
    return (
      <AuthLoadingScreen
        title="Opening Vulu"
        detail="Preparing your profile."
      />
    );
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (hasActiveSession) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
