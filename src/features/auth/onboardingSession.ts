import type { VuluOnboardingStepId } from './onboardingState';

export type OnboardingRedirectTarget = '/onboarding' | '/(auth)/verify-email' | '/(tabs)' | null;

type ResolveOnboardingRedirectOptions = {
  isPreview: boolean;
  isAuthLoaded: boolean;
  hasSession: boolean;
  isSignedIn: boolean;
  needsVerification: boolean;
  currentStep: VuluOnboardingStepId;
  shouldSkipOnboarding: boolean;
  isComplete: boolean;
  completionStepUnlocked: boolean;
};

type CanUploadOnboardingMediaOptions = {
  isPreview: boolean;
  hasSession: boolean;
  needsVerification: boolean;
};

export function resolveOnboardingRedirect({
  isPreview,
  isAuthLoaded,
  hasSession,
  isSignedIn,
  needsVerification,
  currentStep,
  shouldSkipOnboarding,
  isComplete,
  completionStepUnlocked,
}: ResolveOnboardingRedirectOptions): OnboardingRedirectTarget {
  if (isPreview || !isAuthLoaded) {
    return null;
  }

  if (!hasSession && currentStep !== 'welcome') {
    return '/onboarding';
  }

  if (hasSession && needsVerification && currentStep !== 'welcome') {
    return '/onboarding';
  }

  if (isSignedIn && shouldSkipOnboarding) {
    return '/(tabs)';
  }

  if (isSignedIn && isComplete && !completionStepUnlocked) {
    return '/(tabs)';
  }

  return null;
}

export function canUploadOnboardingMedia({
  isPreview,
  hasSession,
  needsVerification,
}: CanUploadOnboardingMediaOptions): boolean {
  if (isPreview) {
    return false;
  }

  return hasSession && !needsVerification;
}
