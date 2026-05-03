import type { UserProfile, UserProfileGender } from '../../context/UserProfileContext';
import { isBirthDateWithinAgeRange } from '../../utils/birthDate';

export type OnboardingProfileSnapshot = Pick<
  UserProfile,
  'name' | 'username' | 'age' | 'birthDate' | 'genderIdentity' | 'photos' | 'avatarUrl'
>;

export type VuluOnboardingStepId =
  | 'welcome'
  | 'name'
  | 'age'
  | 'gender'
  | 'avatar'
  | 'verification'
  | 'finish';

const MIN_NAME_LENGTH = 2;
const MIN_USERNAME_LENGTH = 3;
const MIN_AGE = 13;
const MAX_AGE = 99;

export const onboardingGenderOptions: ReadonlyArray<{
  id: UserProfileGender;
  label: string;
}> = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'non_binary', label: 'Non-binary' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function hasOnboardingAvatar(profile: OnboardingProfileSnapshot): boolean {
  return profile.photos.length > 0 || profile.avatarUrl.trim().length > 0;
}

export function normalizeOnboardingUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/_{2,}/g, '_')
    .slice(0, 20);
}

export function createOnboardingUsernameSuggestion(name: string): string {
  const base = normalizeOnboardingUsername(name.replace(/\s+/g, ''));
  if (base.length >= MIN_USERNAME_LENGTH) {
    return base;
  }
  return `vulu${base}`.slice(0, 20);
}

export function isOnboardingGenderIdentity(value: unknown): value is UserProfileGender {
  return onboardingGenderOptions.some((option) => option.id === value);
}

export function readVuluOnboardingChecklist(profile: OnboardingProfileSnapshot) {
  const hasName = profile.name.trim().length >= MIN_NAME_LENGTH;
  const hasUsername = normalizeOnboardingUsername(profile.username).length >= MIN_USERNAME_LENGTH;
  const hasBirthDate = isBirthDateWithinAgeRange(profile.birthDate, MIN_AGE, MAX_AGE);
  const hasAge = Number.isFinite(profile.age) && profile.age >= MIN_AGE && profile.age <= MAX_AGE;
  const hasGender = isOnboardingGenderIdentity(profile.genderIdentity);
  const hasAvatar = hasOnboardingAvatar(profile);

  return {
    hasName,
    hasUsername,
    hasBirthDate,
    hasAge,
    hasBirthdayRequirement: hasBirthDate || hasAge,
    hasGender,
    hasAvatar,
  };
}

export function isVuluOnboardingComplete(profile: OnboardingProfileSnapshot): boolean {
  const checklist = readVuluOnboardingChecklist(profile);
  return (
    checklist.hasName &&
    checklist.hasUsername &&
    checklist.hasBirthdayRequirement &&
    checklist.hasGender &&
    checklist.hasAvatar
  );
}

export function shouldSkipVuluOnboardingForQa(): boolean {
  const value = process.env.EXPO_PUBLIC_QA_SKIP_ONBOARDING?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function shouldOpenVuluHomePreviewForQa(): boolean {
  const value = process.env.EXPO_PUBLIC_QA_HOME_PREVIEW?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function readFirstIncompleteOnboardingStep(
  profile: OnboardingProfileSnapshot,
): VuluOnboardingStepId {
  const checklist = readVuluOnboardingChecklist(profile);

  if (!checklist.hasName || !checklist.hasUsername) {
    return 'name';
  }
  if (!checklist.hasBirthdayRequirement) {
    return 'age';
  }
  if (!checklist.hasGender) {
    return 'gender';
  }
  if (!checklist.hasAvatar) {
    return 'avatar';
  }
  return 'finish';
}
