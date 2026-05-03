import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth as useSessionAuth } from '../src/auth/clerkSession';
import { useUserProfile } from '../src/context/UserProfileContext';
import { AuthLoadingScreen } from '../src/features/auth/AuthLoadingScreen';
import {
  isVuluOnboardingComplete,
  shouldSkipVuluOnboardingForQa,
} from '../src/features/auth/onboardingState';

export default function Index() {
  const params = useLocalSearchParams<{ preview?: string | string[]; demo?: string | string[] }>();
  const { isLoaded, hasSession, isSignedIn, needsVerification } = useSessionAuth();
  const { isProfileReady, userProfile } = useUserProfile();
  const hasPendingSession = hasSession && !isSignedIn && !needsVerification;
  const hasActiveSession = isSignedIn;
  const shouldSkipOnboarding = shouldSkipVuluOnboardingForQa();
  const needsOnboarding =
    hasActiveSession && !shouldSkipOnboarding && !isVuluOnboardingComplete(userProfile);
  const isPreview =
    __DEV__ &&
    (params.preview === '1' ||
      params.preview === 'true' ||
      (Array.isArray(params.preview) && params.preview.includes('1')));
  const isDemoMode =
    (process.env.EXPO_PUBLIC_VULU_DEMO_MODE?.trim().toLowerCase() ?? 'false') === 'true' ||
    params.demo === '1' ||
    params.demo === 'true' ||
    (Array.isArray(params.demo) && (params.demo.includes('1') || params.demo.includes('true')));

  if (isPreview) {
    return <Redirect href={{ pathname: '/(tabs)', params: { preview: '1' } }} />;
  }

  if (isDemoMode) {
    return <Redirect href={'/demo' as never} />;
  }

  if (!isLoaded) {
    return (
      <AuthLoadingScreen
        title="Opening Vulu"
        detail="Checking your session."
      />
    );
  }

  if (hasSession && needsVerification) {
    return <Redirect href="/onboarding" />;
  }

  if (hasPendingSession && !isVuluOnboardingComplete(userProfile)) {
    return <Redirect href="/onboarding" />;
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

  if (hasSession && isVuluOnboardingComplete(userProfile) && !needsVerification) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/onboarding" />;
}
