import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasOnboardingAvatar,
  isVuluOnboardingComplete,
  readFirstIncompleteOnboardingStep,
  type OnboardingProfileSnapshot,
} from './onboardingState';

const baseProfile: OnboardingProfileSnapshot = {
  name: 'Alex Doe',
  username: 'alexd',
  age: 0,
  birthDate: '2000-05-16',
  genderIdentity: 'male',
  photos: [],
  avatarUrl: '',
};

test('treats legacy avatarUrl-only profiles as complete', () => {
  const profile: OnboardingProfileSnapshot = {
    ...baseProfile,
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  assert.equal(hasOnboardingAvatar(profile), true);
  assert.equal(isVuluOnboardingComplete(profile), true);
  assert.equal(readFirstIncompleteOnboardingStep(profile), 'finish');
});

test('still requires an avatar source before finishing onboarding', () => {
  assert.equal(hasOnboardingAvatar(baseProfile), false);
  assert.equal(isVuluOnboardingComplete(baseProfile), false);
  assert.equal(readFirstIncompleteOnboardingStep(baseProfile), 'avatar');
});

test('accepts a valid birth date in place of a manually entered age', () => {
  const profile: OnboardingProfileSnapshot = {
    ...baseProfile,
    photos: [{ id: 'photo-1', uri: 'https://example.com/avatar.jpg' }],
  };

  assert.equal(isVuluOnboardingComplete(profile), true);
  assert.equal(readFirstIncompleteOnboardingStep(profile), 'finish');
});

test('keeps legacy age-only profiles valid for already-complete users', () => {
  const profile: OnboardingProfileSnapshot = {
    ...baseProfile,
    age: 24,
    birthDate: '',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  assert.equal(isVuluOnboardingComplete(profile), true);
  assert.equal(readFirstIncompleteOnboardingStep(profile), 'finish');
});
