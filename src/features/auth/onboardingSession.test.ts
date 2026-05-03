import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUploadOnboardingMedia,
  resolveOnboardingRedirect,
} from './onboardingSession';

test('allows onboarding media uploads while session sync is still pending', () => {
  assert.equal(
    canUploadOnboardingMedia({
      isPreview: false,
      hasSession: true,
      needsVerification: false,
    }),
    true,
  );
});

test('blocks onboarding media uploads in preview mode or before auth session exists', () => {
  assert.equal(
    canUploadOnboardingMedia({
      isPreview: true,
      hasSession: true,
      needsVerification: false,
    }),
    false,
  );
  assert.equal(
    canUploadOnboardingMedia({
      isPreview: false,
      hasSession: false,
      needsVerification: false,
    }),
    false,
  );
});

test('keeps pending onboarding sessions on onboarding instead of bouncing to app routes', () => {
  assert.equal(
    resolveOnboardingRedirect({
      isPreview: false,
      isAuthLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: false,
      currentStep: 'avatar',
      shouldSkipOnboarding: false,
      isComplete: true,
      completionStepUnlocked: false,
    }),
    null,
  );
});

test('redirects verified sessions to app tabs only after sign-in is fully ready', () => {
  assert.equal(
    resolveOnboardingRedirect({
      isPreview: false,
      isAuthLoaded: true,
      hasSession: true,
      isSignedIn: true,
      needsVerification: false,
      currentStep: 'avatar',
      shouldSkipOnboarding: false,
      isComplete: true,
      completionStepUnlocked: false,
    }),
    '/(tabs)',
  );
});

test('redirects incomplete onboarding without a session back to login', () => {
  assert.equal(
    resolveOnboardingRedirect({
      isPreview: false,
      isAuthLoaded: true,
      hasSession: false,
      isSignedIn: false,
      needsVerification: false,
      currentStep: 'avatar',
      shouldSkipOnboarding: false,
      isComplete: false,
      completionStepUnlocked: false,
    }),
    '/onboarding',
  );
});

test('keeps unverified sessions on the onboarding welcome step', () => {
  assert.equal(
    resolveOnboardingRedirect({
      isPreview: false,
      isAuthLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: true,
      currentStep: 'welcome',
      shouldSkipOnboarding: false,
      isComplete: false,
      completionStepUnlocked: false,
    }),
    null,
  );
});

test('resets unverified sessions back to onboarding welcome from later steps', () => {
  assert.equal(
    resolveOnboardingRedirect({
      isPreview: false,
      isAuthLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: true,
      currentStep: 'avatar',
      shouldSkipOnboarding: false,
      isComplete: false,
      completionStepUnlocked: false,
    }),
    '/onboarding',
  );
});
