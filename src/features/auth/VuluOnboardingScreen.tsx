import { useSSO } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
  View,
  useWindowDimensions,
} from 'react-native';

import { useAuth as useSessionAuth, isEdgeBackendTransportSyncError } from '../../auth/clerkSession';
import { AppScreen, AppText, AppTextInput } from '../../components';
import { toast } from '../../components/Toast';
import {
  type UserProfileGender,
  type UserProfilePhoto,
  useUserProfile,
} from '../../context/UserProfileContext';
import { radius, spacing } from '../../theme';
import {
  buildBirthDateFromAge,
  deriveAgeFromBirthDate,
  formatBirthDate,
  isBirthDateWithinAgeRange,
  parseBirthDate,
} from '../../utils/birthDate';
import { uploadMediaAsset } from '../../utils/mediaUpload';
import {
  createOnboardingUsernameSuggestion,
  hasOnboardingAvatar,
  isOnboardingGenderIdentity,
  isVuluOnboardingComplete,
  normalizeOnboardingUsername,
  onboardingGenderOptions,
  readFirstIncompleteOnboardingStep,
  shouldSkipVuluOnboardingForQa,
  type VuluOnboardingStepId,
} from './onboardingState';
import { canUploadOnboardingMedia, resolveOnboardingRedirect } from './onboardingSession';

type OnboardingDraft = {
  name: string;
  username: string;
  birthDate: string;
  genderIdentity?: UserProfileGender;
};

type StepConfig = {
  id: VuluOnboardingStepId;
  eyebrow: string;
  title: string;
  body: string;
};

type AvatarDragState = {
  photoId: string;
  startIndex: number;
  currentIndex: number;
};

type AvatarEditorAsset = {
  id: string;
  uri: string;
  width: number;
  height: number;
  source: 'library' | 'camera';
  mediaLibraryAssetId?: string;
};

type NotificationPermissionState = {
  status: Notifications.PermissionStatus | null;
  canAskAgain: boolean;
};

type OAuthProvider = 'apple';

const OAUTH_PROVIDERS: ReadonlyArray<{
  id: OAuthProvider;
  title: string;
  strategy: 'oauth_apple';
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'apple',
    title: 'Continue with Apple',
    strategy: 'oauth_apple',
    icon: 'logo-apple',
  },
];

const STEP_ORDER: readonly VuluOnboardingStepId[] = [
  'welcome',
  'name',
  'age',
  'gender',
  'avatar',
  'verification',
  'finish',
];

const ACTIONABLE_STEPS = STEP_ORDER.filter((step) => step !== 'welcome');
const MAX_ONBOARDING_PHOTOS = 6;
const MIN_BIRTHDAY_AGE = 13;
const MAX_BIRTHDAY_AGE = 99;
const PENDING_AVATAR_ID_PREFIX = 'onboarding-avatar-pending-';
const AVATAR_EDITOR_PAGE_SIZE = 60;
const AVATAR_CROP_MAX_SCALE = 3;
const AVATAR_CROP_FRAME_RATIO = 196 / 148;
const AVATAR_CROP_OUTPUT_WIDTH = 960;
const AVATAR_CROP_JPEG_QUALITY = 0.82;
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function readOAuthErrorMessage(error: unknown, provider: OAuthProvider): string {
  const providerName = 'Apple';
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : `${providerName} sign-in failed.`;
  if (
    message.includes('does not match one of the allowed values for parameter strategy') ||
    message.toLowerCase().includes('strategy')
  ) {
    return `${providerName} sign-in is not enabled in Clerk yet.`;
  }
  return message;
}

const STEP_CONFIG: Record<VuluOnboardingStepId, StepConfig> = {
  welcome: {
    id: 'welcome',
    eyebrow: 'VULU',
    title: 'WELCOME TO VULU',
    body: 'A dark social space for live rooms, messages, profiles, and real people.',
  },
  name: {
    id: 'name',
    eyebrow: '2 of 7',
    title: "WHAT'S YOUR NAME?",
    body: 'This is how others will see you.',
  },
  age: {
    id: 'age',
    eyebrow: '3 of 7',
    title: "WHEN'S YOUR BIRTHDAY?",
    body: 'You must be 13 or older to use Vulu.',
  },
  gender: {
    id: 'gender',
    eyebrow: '4 of 7',
    title: "WHAT'S YOUR GENDER?",
    body: 'You can change this later in settings.',
  },
  avatar: {
    id: 'avatar',
    eyebrow: '5 of 7',
    title: 'ADD YOUR PHOTOS',
    body: 'Add at least 1 photo to continue.',
  },
  verification: {
    id: 'verification',
    eyebrow: '6 of 7',
    title: 'VERIFY YOUR FACE',
    body: 'For admin verification only. This is never shown publicly.',
  },
  finish: {
    id: 'finish',
    eyebrow: '7 of 7',
    title: 'STAY CONNECTED',
    body: 'Get notified when friends go live, message you, or want to connect.',
  },
};

function buildDraftFromProfile(profile: ReturnType<typeof useUserProfile>['userProfile']): OnboardingDraft {
  return {
    name: profile.name,
    username:
      normalizeOnboardingUsername(profile.username) ||
      createOnboardingUsernameSuggestion(profile.name),
    birthDate: profile.birthDate || buildBirthDateFromAge(profile.age) || '',
    genderIdentity: profile.genderIdentity,
  };
}

function createPickerDate(parts: { year: number; month: number; day: number }): Date {
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

function readStepIndex(step: VuluOnboardingStepId): number {
  return STEP_ORDER.indexOf(step);
}

function movePhotoToIndex(
  photos: UserProfilePhoto[],
  photoId: string,
  targetIndex: number,
): UserProfilePhoto[] {
  const sourceIndex = photos.findIndex((photo) => photo.id === photoId);
  if (sourceIndex < 0) {
    return photos;
  }

  const boundedIndex = Math.max(0, Math.min(targetIndex, photos.length - 1));
  if (boundedIndex === sourceIndex) {
    return photos;
  }

  const next = [...photos];
  const [movedPhoto] = next.splice(sourceIndex, 1);
  if (!movedPhoto) {
    return photos;
  }
  next.splice(boundedIndex, 0, movedPhoto);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeCropMetrics(
  asset: Pick<AvatarEditorAsset, 'width' | 'height'>,
  cropWidth: number,
  cropHeight: number,
  scale: number,
) {
  const sourceWidth = asset.width || cropWidth;
  const sourceHeight = asset.height || cropHeight;
  const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
  const frameRatio = cropWidth / Math.max(1, cropHeight);

  let baseWidth = cropWidth;
  let baseHeight = cropHeight;

  if (sourceRatio >= frameRatio) {
    baseHeight = cropHeight;
    baseWidth = cropHeight * sourceRatio;
  } else {
    baseWidth = cropWidth;
    baseHeight = cropWidth / Math.max(0.0001, sourceRatio);
  }

  return {
    sourceWidth,
    sourceHeight,
    baseWidth,
    baseHeight,
    displayWidth: baseWidth * scale,
    displayHeight: baseHeight * scale,
  };
}

function clampCropOffset(
  offset: { x: number; y: number },
  displayWidth: number,
  displayHeight: number,
  cropWidth: number,
  cropHeight: number,
) {
  const maxX = Math.max(0, (displayWidth - cropWidth) / 2);
  const maxY = Math.max(0, (displayHeight - cropHeight) / 2);

  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

function requestableLibraryPermissions(): boolean {
  return Platform.OS !== 'ios';
}

function isOnboardingUploadSignerUnreachable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = message.trim().toLowerCase();
  return normalized.includes('could not reach upload signer') || normalized.includes('/presign');
}

function WelcomeBackground() {
  return (
    <>
      <LinearGradient
        colors={['#010101', '#05110C', '#0A1E17']}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.96, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(16,185,129,0.12)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.36)']}
        locations={[0, 0.42, 1]}
        start={{ x: 0, y: 0.08 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.welcomeGlowLeft} />
      <View style={styles.welcomeGlowRight} />
      <View style={styles.welcomeSparkA} />
      <View style={styles.welcomeSparkB} />
      <View style={styles.welcomeSparkC} />
      <View style={styles.welcomeDotA} />
      <View style={styles.welcomeDotB} />
      <View style={styles.welcomeDotC} />
      <View style={styles.welcomeDotD} />
    </>
  );
}

function LightBackground() {
  return (
    <>
      <View style={styles.bgBlobLeft} />
      <View style={styles.bgBlobCenter} />
      <View style={styles.bgBlobRight} />
      <View style={styles.bgRibbonTop} />
      <View style={styles.bgRibbonBottom} />
      <View style={styles.bgDots} />
    </>
  );
}

type PillButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

function PillButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
}: PillButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillButton,
        isPrimary ? styles.pillButtonPrimary : styles.pillButtonSecondary,
        pressed && !disabled && styles.pillButtonPressed,
        disabled && styles.pillButtonDisabled,
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={isPrimary ? '#000000' : '#FFFFFF'}
          style={styles.pillButtonIcon}
        />
      ) : null}
      <AppText
        variant="bodyBold"
        style={isPrimary ? styles.pillButtonTextPrimary : styles.pillButtonTextSecondary}
      >
        {title}
      </AppText>
    </Pressable>
  );
}

type OptionCardProps = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
};

function OptionCard({ label, subtitle, selected, onPress }: OptionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        selected && styles.optionCardSelected,
        pressed && styles.optionCardPressed,
      ]}
    >
      <AppText variant="smallBold" style={styles.optionCardLabel}>
        {label}
      </AppText>
      {subtitle ? (
        <AppText variant="tiny" style={styles.optionCardSubtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function VuluOnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string | string[] }>();
  const { startSSOFlow } = useSSO();
  const { width, height } = useWindowDimensions();
  const {
    isLoaded: isAuthLoaded,
    getToken,
    hasSession,
    isSignedIn,
    needsVerification,
    signOut,
    syncError,
  } = useSessionAuth();
  const { userProfile, updateAvatar, updateUserProfile } = useUserProfile();
  const latestProfileRef = useRef(userProfile);
  const canceledAvatarUploadsRef = useRef<Set<string>>(new Set());
  const avatarDragReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initiallyCompleteRef = useRef(isVuluOnboardingComplete(userProfile));
  const hasAppliedInitialStepRef = useRef(false);
  const [draft, setDraft] = useState<OnboardingDraft>(() => buildDraftFromProfile(userProfile));
  const [stepIndex, setStepIndex] = useState(() => readStepIndex('welcome'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingVerification, setIsUploadingVerification] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<Record<string, number>>({});
  const [completionStepUnlocked, setCompletionStepUnlocked] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [activeOAuthProvider, setActiveOAuthProvider] = useState<OAuthProvider | null>(null);
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>({
    status: null,
    canAskAgain: true,
  });
  const [isNativeBirthdayPickerOpen, setIsNativeBirthdayPickerOpen] = useState(false);
  const [pendingNativeBirthDate, setPendingNativeBirthDate] = useState<Date | null>(null);
  const [avatarDragState, setAvatarDragState] = useState<AvatarDragState | null>(null);
  const [isAvatarEditorVisible, setIsAvatarEditorVisible] = useState(false);
  const [avatarEditorAssets, setAvatarEditorAssets] = useState<AvatarEditorAsset[]>([]);
  const [avatarEditorAsset, setAvatarEditorAsset] = useState<AvatarEditorAsset | null>(null);
  const [avatarEditorSource, setAvatarEditorSource] = useState<'library' | 'camera' | null>(null);
  const [isLoadingAvatarEditorAssets, setIsLoadingAvatarEditorAssets] = useState(false);
  const [isApplyingAvatarCrop, setIsApplyingAvatarCrop] = useState(false);
  const [isAvatarProfilePreviewVisible, setIsAvatarProfilePreviewVisible] = useState(false);
  const [avatarCropScale, setAvatarCropScale] = useState(1);
  const [avatarCropOffset, setAvatarCropOffset] = useState({ x: 0, y: 0 });
  const [isVerificationCameraReady, setIsVerificationCameraReady] = useState(false);
  const avatarDragStateRef = useRef<AvatarDragState | null>(null);
  const verificationCameraRef = useRef<CameraView | null>(null);
  const avatarDragTranslation = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const avatarRailScrollOffsetRef = useRef(0);
  const avatarCropDragStartRef = useRef({ x: 0, y: 0 });
  const avatarCropScaleRef = useRef(1);
  const avatarCropOffsetRef = useRef({ x: 0, y: 0 });
  const [verificationCameraPermission, requestVerificationCameraPermission] = useCameraPermissions();

  const isPreview =
    __DEV__ &&
    (params.preview === '1' ||
      params.preview === 'true' ||
      (Array.isArray(params.preview) && params.preview.includes('1')));

  const currentStep = STEP_ORDER[stepIndex] ?? 'welcome';
  const hasOnboardingSession = hasSession;
  const canEnterWithDegradedBackend =
    hasSession && !isSignedIn && isEdgeBackendTransportSyncError(syncError);
  const degradedFinishToastShownRef = useRef(false);
  const currentConfig = STEP_CONFIG[currentStep];
  const isComplete = useMemo(() => isVuluOnboardingComplete(userProfile), [userProfile]);
  const shouldAutoExitCompletedOnboarding = initiallyCompleteRef.current && isComplete;
  const shouldSkipOnboarding = shouldSkipVuluOnboardingForQa();
  const currentScreenNumber = readStepIndex(currentStep) + 1;
  const progressIndex = Math.max(0, ACTIONABLE_STEPS.findIndex((step) => step === currentStep) + 1);
  const isShortViewport = height < 860;
  const contentWidth = Math.min(520, width - (isShortViewport ? spacing.lg * 2 : spacing.xl * 2));
  const selectedAvatarPhoto =
    userProfile.photos.find((photo) => photo.uri === userProfile.avatarUrl) ?? userProfile.photos[0];
  const photoPreviewUri = selectedAvatarPhoto?.uri || userProfile.avatarUrl;
  const hasAvatar = hasOnboardingAvatar(userProfile);
  const visibleAvatarPhotos = userProfile.photos.slice(0, MAX_ONBOARDING_PHOTOS);
  const avatarRailGap = spacing.sm;
  const pendingAvatarPhotos = visibleAvatarPhotos.filter((photo) =>
    photo.id.startsWith(PENDING_AVATAR_ID_PREFIX),
  );
  const totalAvatarUploadProgress = pendingAvatarPhotos.length
    ? Math.round(
        pendingAvatarPhotos.reduce((sum, photo) => sum + (avatarUploadProgress[photo.id] ?? 8), 0) /
          pendingAvatarPhotos.length,
      )
    : 0;
  const remainingAvatarSlots = Math.max(0, MAX_ONBOARDING_PHOTOS - visibleAvatarPhotos.length);
  const avatarProgressWidth = `${Math.max(6, totalAvatarUploadProgress)}%` as `${number}%`;
  const avatarTileWidth = Math.max(
    isShortViewport ? 78 : 88,
    Math.floor((contentWidth - spacing.md * 2) / (isShortViewport ? 3.8 : 3.45)),
  );
  const avatarTileHeight = Math.round(avatarTileWidth * 1.34);
  const avatarCropFrameWidth = Math.min(
    width - spacing.xl * 2,
    320,
    (height * 0.44) / AVATAR_CROP_FRAME_RATIO,
  );
  const avatarCropFrameHeight = avatarCropFrameWidth * AVATAR_CROP_FRAME_RATIO;
  const verificationFrameHeight = Math.min(
    isShortViewport ? 320 : 392,
    Math.max(isShortViewport ? 244 : 292, height - (isShortViewport ? 520 : 456)),
  );
  const avatarCropMetrics = avatarEditorAsset
    ? computeCropMetrics(avatarEditorAsset, avatarCropFrameWidth, avatarCropFrameHeight, avatarCropScale)
    : null;
  const displayAvatarPhotos = useMemo(() => {
    if (!avatarDragState) {
      return visibleAvatarPhotos;
    }

    return movePhotoToIndex(visibleAvatarPhotos, avatarDragState.photoId, avatarDragState.currentIndex);
  }, [avatarDragState, visibleAvatarPhotos]);
  const draggingAvatarPhoto = avatarDragState
    ? visibleAvatarPhotos.find((photo) => photo.id === avatarDragState.photoId) ?? null
    : null;
  const avatarDragOverlayLeft =
    avatarDragState !== null
      ? avatarDragState.startIndex * (avatarTileWidth + avatarRailGap) - avatarRailScrollOffsetRef.current
      : 0;
  const canGoBackToAuth = isPreview || !hasOnboardingSession;
  const canUploadMedia = canUploadOnboardingMedia({
    isPreview,
    hasSession,
    needsVerification,
  });
  const onboardingRedirect = resolveOnboardingRedirect({
    isPreview,
    isAuthLoaded,
    hasSession,
    isSignedIn,
    needsVerification,
    currentStep,
    shouldSkipOnboarding,
    isComplete: shouldAutoExitCompletedOnboarding,
    completionStepUnlocked,
  });
  const finishPendingMessage =
    currentStep === 'finish' && hasOnboardingSession && !isSignedIn && !canEnterWithDegradedBackend
      ? syncError ?? 'We are still finishing your sign-in. Stay here for a moment, then enter VULU.'
      : null;
  const notificationButtonTitle = useMemo(() => {
    if (isRequestingNotifications) {
      return 'Requesting notifications...';
    }
    if (notificationPermission.status === 'granted') {
      return 'Enter VULU';
    }
    if (
      notificationPermission.status === 'denied' &&
      !notificationPermission.canAskAgain &&
      Platform.OS !== 'web'
    ) {
      return 'Open notification settings';
    }
    return 'Enable notifications';
  }, [
    isRequestingNotifications,
    notificationPermission.canAskAgain,
    notificationPermission.status,
  ]);
  const fallbackBirthDate = useMemo(() => {
    return (
      buildBirthDateFromAge(
        userProfile.age >= MIN_BIRTHDAY_AGE && userProfile.age <= MAX_BIRTHDAY_AGE
          ? userProfile.age
          : 18,
      ) ?? '2006-01-01'
    );
  }, [userProfile.age]);
  const selectedBirthDateParts = useMemo(() => {
    return (
      parseBirthDate(draft.birthDate) ??
      parseBirthDate(fallbackBirthDate) ?? {
        year: 2006,
        month: 1,
        day: 1,
      }
    );
  }, [draft.birthDate, fallbackBirthDate]);
  const selectedBirthDateValue = useMemo(
    () => createPickerDate(selectedBirthDateParts),
    [selectedBirthDateParts],
  );
  const minimumBirthdayDate = useMemo(() => {
    const now = new Date();
    return createPickerDate({
      year: now.getFullYear() - MAX_BIRTHDAY_AGE,
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
  }, []);
  const maximumBirthdayDate = useMemo(() => {
    const now = new Date();
    return createPickerDate({
      year: now.getFullYear() - MIN_BIRTHDAY_AGE,
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
  }, []);
  const minimumBirthdayValue = useMemo(
    () =>
      formatBirthDate({
        year: minimumBirthdayDate.getFullYear(),
        month: minimumBirthdayDate.getMonth() + 1,
        day: minimumBirthdayDate.getDate(),
      }),
    [minimumBirthdayDate],
  );
  const maximumBirthdayValue = useMemo(
    () =>
      formatBirthDate({
        year: maximumBirthdayDate.getFullYear(),
        month: maximumBirthdayDate.getMonth() + 1,
        day: maximumBirthdayDate.getDate(),
      }),
    [maximumBirthdayDate],
  );
  const selectedBirthdayAge = useMemo(
    () => deriveAgeFromBirthDate(draft.birthDate),
    [draft.birthDate],
  );
  const hasSelectedBirthDate = draft.birthDate.trim().length > 0;
  const formattedBirthdayLabel = useMemo(() => {
    if (!hasSelectedBirthDate) {
      return 'Choose your birthday';
    }
    return `${MONTH_LABELS[selectedBirthDateParts.month - 1] ?? 'Month'} ${selectedBirthDateParts.day}, ${selectedBirthDateParts.year}`;
  }, [
    hasSelectedBirthDate,
    selectedBirthDateParts.day,
    selectedBirthDateParts.month,
    selectedBirthDateParts.year,
  ]);
  const isStepActionDisabled = useMemo(() => {
    if (isUploadingAvatar || isUploadingVerification) {
      return true;
    }

    if (currentStep === 'name') {
      return (
        draft.name.trim().length < 2 ||
        normalizeOnboardingUsername(draft.username).length < 3
      );
    }

    if (currentStep === 'age') {
      return !isBirthDateWithinAgeRange(
        draft.birthDate,
        MIN_BIRTHDAY_AGE,
        MAX_BIRTHDAY_AGE,
      );
    }

    if (currentStep === 'gender') {
      return !isOnboardingGenderIdentity(draft.genderIdentity);
    }

    if (currentStep === 'avatar') {
      return !hasAvatar;
    }

    if (currentStep === 'verification') {
      return !userProfile.verificationPhotoUri?.trim();
    }

    if (currentStep === 'finish') {
      return hasOnboardingSession && !isSignedIn && !canEnterWithDegradedBackend;
    }

    return false;
  }, [
    currentStep,
    draft.birthDate,
    draft.genderIdentity,
    draft.name,
    draft.username,
    hasAvatar,
    canEnterWithDegradedBackend,
    hasOnboardingSession,
    isSignedIn,
    isUploadingAvatar,
    isUploadingVerification,
    userProfile.verificationPhotoUri,
  ]);

  useEffect(() => {
    latestProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    if (avatarEditorAsset) {
      return;
    }

    avatarCropScaleRef.current = 1;
    avatarCropOffsetRef.current = { x: 0, y: 0 };
    setAvatarCropScale(1);
    setAvatarCropOffset({ x: 0, y: 0 });
  }, [avatarEditorAsset]);

  useEffect(() => {
    if (currentStep !== 'verification') {
      return;
    }
    if (userProfile.verificationPhotoUri) {
      return;
    }
    if (verificationCameraPermission?.status === 'granted') {
      return;
    }
    if (verificationCameraPermission?.canAskAgain === false) {
      return;
    }
    void requestVerificationCameraPermission();
  }, [
    currentStep,
    requestVerificationCameraPermission,
    userProfile.verificationPhotoUri,
    verificationCameraPermission?.canAskAgain,
    verificationCameraPermission?.status,
  ]);

  useEffect(() => {
    if (!avatarDragState) {
      return;
    }

    const activeStillExists = userProfile.photos.some((photo) => photo.id === avatarDragState.photoId);
    if (!activeStillExists) {
      avatarDragStateRef.current = null;
      setAvatarDragState(null);
      avatarDragTranslation.setValue({ x: 0, y: 0 });
    }
  }, [avatarDragState, avatarDragTranslation, userProfile.photos]);

  useEffect(() => {
    setDraft((prev) => ({
      name: prev.name || userProfile.name,
      username:
        prev.username ||
        normalizeOnboardingUsername(userProfile.username) ||
        createOnboardingUsernameSuggestion(userProfile.name),
      birthDate: prev.birthDate || userProfile.birthDate || buildBirthDateFromAge(userProfile.age) || '',
      genderIdentity: prev.genderIdentity ?? userProfile.genderIdentity,
    }));
  }, [
    userProfile.age,
    userProfile.birthDate,
    userProfile.genderIdentity,
    userProfile.name,
    userProfile.username,
  ]);

  useEffect(() => {
    if (hasAppliedInitialStepRef.current || currentStep !== 'welcome') {
      return;
    }

    hasAppliedInitialStepRef.current = true;
    const nextStep = readFirstIncompleteOnboardingStep(userProfile);
    if (nextStep === 'finish') {
      return;
    }

    if (
      userProfile.name.trim() ||
      userProfile.username.trim() ||
      userProfile.birthDate.trim() ||
      userProfile.age > 0 ||
      userProfile.genderIdentity ||
      userProfile.photos.length > 0
    ) {
      setStepIndex(readStepIndex(nextStep));
    }
  }, [currentStep, userProfile]);

  if (onboardingRedirect) {
    return <Redirect href={onboardingRedirect} />;
  }

  const syncDraft = (updates: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  const commitBirthDate = (nextDate: Date) => {
    const nextBirthDate = formatBirthDate({
      year: nextDate.getFullYear(),
      month: nextDate.getMonth() + 1,
      day: nextDate.getDate(),
    });
    syncDraft({ birthDate: nextBirthDate });
  };

  const handleNativeBirthdayChange = (
    event: DateTimePickerEvent,
    nextDate?: Date,
  ) => {
    if (Platform.OS === 'ios') {
      if (nextDate) {
        setPendingNativeBirthDate(nextDate);
      }
      return;
    }

    if (Platform.OS === 'android') {
      setIsNativeBirthdayPickerOpen(false);
    }

    if (event.type === 'dismissed' || !nextDate) {
      return;
    }

    commitBirthDate(nextDate);
  };

  const openNativeBirthdayPicker = () => {
    setPendingNativeBirthDate(selectedBirthDateValue);
    setIsNativeBirthdayPickerOpen(true);
  };

  const closeNativeBirthdayPicker = () => {
    setIsNativeBirthdayPickerOpen(false);
    setPendingNativeBirthDate(null);
  };

  const confirmNativeBirthdayPicker = () => {
    if (pendingNativeBirthDate) {
      commitBirthDate(pendingNativeBirthDate);
    }
    closeNativeBirthdayPicker();
  };

  const goToStep = (step: VuluOnboardingStepId) => {
    setErrorMessage(null);
    setStepIndex(readStepIndex(step));
  };

  const handleNameChange = (value: string) => {
    const nextValue = value.slice(0, 24);
    syncDraft({ name: nextValue });
    if (!usernameTouched) {
      syncDraft({ username: createOnboardingUsernameSuggestion(nextValue) });
    }
  };

  const commitPhotos = (
    nextPhotos: UserProfilePhoto[],
    options?: { syncAvatarToFirst?: boolean },
  ) => {
    const normalizedPhotos = nextPhotos.slice(0, MAX_ONBOARDING_PHOTOS);
    const currentAvatarUrl = latestProfileRef.current.avatarUrl.trim();
    const nextAvatarUrl = options?.syncAvatarToFirst
      ? normalizedPhotos[0]?.uri ?? ''
      : normalizedPhotos.some((photo) => photo.uri === currentAvatarUrl)
        ? currentAvatarUrl
        : normalizedPhotos[0]?.uri ?? '';
    updateUserProfile({
      photos: normalizedPhotos,
      avatarUrl: nextAvatarUrl,
    });
  };

  const resetAvatarDrag = () => {
    if (avatarDragReleaseTimerRef.current) {
      clearTimeout(avatarDragReleaseTimerRef.current);
      avatarDragReleaseTimerRef.current = null;
    }
    avatarDragStateRef.current = null;
    setAvatarDragState(null);
    avatarDragTranslation.setValue({ x: 0, y: 0 });
  };

  const finishAvatarDrag = () => {
    const activeDrag = avatarDragStateRef.current;
    if (!activeDrag) {
      return;
    }

    if (activeDrag.currentIndex !== activeDrag.startIndex) {
      commitPhotos(
        movePhotoToIndex(latestProfileRef.current.photos, activeDrag.photoId, activeDrag.currentIndex),
        { syncAvatarToFirst: true },
      );
    }

    resetAvatarDrag();
  };

  const beginAvatarDrag = (photoId: string) => {
    if (isUploadingAvatar) {
      return;
    }

    const sourceIndex = visibleAvatarPhotos.findIndex((photo) => photo.id === photoId);
    if (sourceIndex < 0) {
      return;
    }

    const nextDragState: AvatarDragState = {
      photoId,
      startIndex: sourceIndex,
      currentIndex: sourceIndex,
    };
    avatarDragTranslation.setValue({ x: 0, y: 0 });
    avatarDragStateRef.current = nextDragState;
    setAvatarDragState(nextDragState);
  };

  const avatarRailPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => avatarDragStateRef.current !== null,
        onMoveShouldSetPanResponderCapture: () => avatarDragStateRef.current !== null,
        onPanResponderMove: (_, gestureState) => {
          const activeDrag = avatarDragStateRef.current;
          if (!activeDrag) {
            return;
          }

          if (avatarDragReleaseTimerRef.current) {
            clearTimeout(avatarDragReleaseTimerRef.current);
            avatarDragReleaseTimerRef.current = null;
          }

          avatarDragTranslation.setValue({ x: gestureState.dx, y: gestureState.dy * 0.08 });
          const offset = Math.round(gestureState.dx / (avatarTileWidth + avatarRailGap));
          const nextIndex = Math.max(
            0,
            Math.min(visibleAvatarPhotos.length - 1, activeDrag.startIndex + offset),
          );

          if (nextIndex !== activeDrag.currentIndex) {
            const nextDragState = { ...activeDrag, currentIndex: nextIndex };
            avatarDragStateRef.current = nextDragState;
            setAvatarDragState(nextDragState);
          }
        },
        onPanResponderRelease: () => {
          finishAvatarDrag();
        },
        onPanResponderTerminate: () => {
          finishAvatarDrag();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [avatarDragTranslation, avatarRailGap, avatarTileWidth, visibleAvatarPhotos.length],
  );

  const handleRemoveAvatarPhoto = (photoId: string) => {
    const targetPhoto = latestProfileRef.current.photos.find((photo) => photo.id === photoId);
    if (!targetPhoto) {
      return;
    }

    if (photoId.startsWith(PENDING_AVATAR_ID_PREFIX)) {
      canceledAvatarUploadsRef.current.add(photoId);
      setAvatarUploadProgress((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
    }

    commitPhotos(latestProfileRef.current.photos.filter((photo) => photo.id !== photoId));
  };

  const openAvatarEditor = (
    asset: AvatarEditorAsset,
    source: 'library' | 'camera',
    libraryAssets?: AvatarEditorAsset[],
  ) => {
    setAvatarEditorSource(source);
    setAvatarEditorAsset(asset);
    setAvatarEditorAssets(libraryAssets ?? []);
    setIsAvatarEditorVisible(true);
  };

  const closeAvatarEditor = () => {
    if (isApplyingAvatarCrop) {
      return;
    }

    setIsAvatarEditorVisible(false);
    setAvatarEditorSource(null);
    setAvatarEditorAsset(null);
    setAvatarEditorAssets([]);
  };

  const ensureAvatarLibraryAccess = async (): Promise<boolean> => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      const accessPrivileges =
        'accessPrivileges' in permission && typeof permission.accessPrivileges === 'string'
          ? permission.accessPrivileges
          : undefined;
      const granted = permission.status === 'granted' || accessPrivileges === 'limited';

      if (!granted) {
        toast.error('Photo access is required to choose a picture.');
        return false;
      }

      return true;
    } catch {
      toast.error('Could not open your photo library right now.');
      return false;
    }
  };

  const openAvatarLibraryEditor = async () => {
    if (remainingAvatarSlots <= 0) {
      toast.info(`You can add up to ${MAX_ONBOARDING_PHOTOS} profile photos.`);
      return;
    }

    if (Platform.OS === 'ios') {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: false,
          quality: 0.95,
          selectionLimit: 1,
        });

        if (result.canceled || !result.assets.length) {
          return;
        }

        const asset = result.assets.find((entry) => !!entry.uri);
        if (!asset?.uri) {
          return;
        }

        openAvatarEditor(
          {
            id: `picker-${Date.now()}`,
            uri: asset.uri,
            width: asset.width ?? avatarCropFrameWidth,
            height: asset.height ?? avatarCropFrameHeight,
            source: 'library',
          },
          'library',
          [],
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not open your photos right now.';
        setErrorMessage(message);
        toast.error(message);
      }
      return;
    }

    const hasAccess = await ensureAvatarLibraryAccess();
    if (!hasAccess) {
      return;
    }

    setIsLoadingAvatarEditorAssets(true);
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: AVATAR_EDITOR_PAGE_SIZE,
        mediaType: ['photo'] as any,
        sortBy: ['creationTime'] as any,
      });

      const nextAssets: AvatarEditorAsset[] = page.assets
        .filter((asset) => !!asset.uri)
        .map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          width: asset.width ?? avatarCropFrameWidth,
          height: asset.height ?? avatarCropFrameHeight,
          source: 'library' as const,
          mediaLibraryAssetId: asset.id,
        }));

      if (!nextAssets.length) {
        toast.info('No photos were found in your library.');
        return;
      }

      const initialAsset = await hydrateAvatarEditorAsset(nextAssets[0]);
      openAvatarEditor(initialAsset, 'library', nextAssets);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not load your photos right now.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoadingAvatarEditorAssets(false);
    }
  };

  const openAvatarCameraEditor = async () => {
    if (remainingAvatarSlots <= 0) {
      toast.info(`You can add up to ${MAX_ONBOARDING_PHOTOS} profile photos.`);
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      toast.error('Camera access is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.95,
      cameraType: ImagePicker.CameraType.front,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const asset = result.assets.find((entry) => !!entry.uri);
    if (!asset?.uri) {
      return;
    }

    openAvatarEditor(
      {
        id: `camera-${Date.now()}`,
        uri: asset.uri,
        width: asset.width ?? avatarCropFrameWidth,
        height: asset.height ?? avatarCropFrameHeight,
        source: 'camera',
      },
      'camera',
    );
  };

  const resolveAvatarEditorAssetUri = async (asset: AvatarEditorAsset): Promise<string> => {
    if (asset.source !== 'library' || !asset.mediaLibraryAssetId) {
      return asset.uri;
    }

    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.mediaLibraryAssetId, {
        shouldDownloadFromNetwork: true,
      });
      const localUri =
        'localUri' in info && typeof info.localUri === 'string' && info.localUri.trim().length > 0
          ? info.localUri
          : null;
      if (localUri) {
        return localUri;
      }
    } catch {
      // Fall back to the asset URI below.
    }

    return asset.uri;
  };

  const hydrateAvatarEditorAsset = async (asset: AvatarEditorAsset): Promise<AvatarEditorAsset> => {
    const resolvedUri = await resolveAvatarEditorAssetUri(asset);
    return {
      ...asset,
      uri: resolvedUri,
    };
  };

  const updateAvatarCropOffset = (
    nextOffset: { x: number; y: number },
    scale = avatarCropScaleRef.current,
  ) => {
    if (!avatarEditorAsset) {
      return;
    }

    const metrics = computeCropMetrics(
      avatarEditorAsset,
      avatarCropFrameWidth,
      avatarCropFrameHeight,
      scale,
    );
    const clampedOffset = clampCropOffset(
      nextOffset,
      metrics.displayWidth,
      metrics.displayHeight,
      avatarCropFrameWidth,
      avatarCropFrameHeight,
    );
    avatarCropOffsetRef.current = clampedOffset;
    setAvatarCropOffset(clampedOffset);
  };

  const handleAvatarCropZoomChange = (nextScale: number) => {
    const normalized = clamp(nextScale, 1, AVATAR_CROP_MAX_SCALE);
    avatarCropScaleRef.current = normalized;
    setAvatarCropScale(normalized);
    updateAvatarCropOffset(avatarCropOffsetRef.current, normalized);
  };

  const avatarCropPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!avatarEditorAsset,
        onMoveShouldSetPanResponder: () => !!avatarEditorAsset,
        onPanResponderGrant: () => {
          avatarCropDragStartRef.current = avatarCropOffsetRef.current;
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!avatarEditorAsset) {
            return;
          }

          updateAvatarCropOffset({
            x: avatarCropDragStartRef.current.x + gestureState.dx,
            y: avatarCropDragStartRef.current.y + gestureState.dy,
          });
        },
        onPanResponderRelease: () => {
          avatarCropDragStartRef.current = avatarCropOffsetRef.current;
        },
        onPanResponderTerminate: () => {
          avatarCropDragStartRef.current = avatarCropOffsetRef.current;
        },
      }),
    [avatarCropFrameHeight, avatarCropFrameWidth, avatarEditorAsset],
  );

  const queueAvatarAssets = async (selectedAssets: Array<{ uri: string; mimeType?: string }>) => {
    const knownUris = new Set(latestProfileRef.current.photos.map((photo) => photo.uri));
    const nextAssets = selectedAssets.filter((asset, index, allAssets) => {
      if (!asset.uri || knownUris.has(asset.uri)) {
        return false;
      }
      return allAssets.findIndex((candidate) => candidate.uri === asset.uri) === index;
    });
    if (!nextAssets.length) {
      toast.info('That photo is already in your profile.');
      return;
    }

    const pendingEntries = nextAssets.map((asset, index) => ({
      pendingId: `${PENDING_AVATAR_ID_PREFIX}${Date.now()}-${index}`,
      asset,
    }));
    const previousPhotos = latestProfileRef.current.photos;
    commitPhotos([
      ...previousPhotos,
      ...pendingEntries.map(({ pendingId, asset }) => ({
        id: pendingId,
        uri: asset.uri,
      })),
    ]);
    setAvatarUploadProgress((prev) => ({
      ...prev,
      ...Object.fromEntries(pendingEntries.map(({ pendingId }) => [pendingId, 4])),
    }));

    setIsUploadingAvatar(true);
    toast.info(
      nextAssets.length === 1 ? 'Uploading profile photo...' : `Uploading ${nextAssets.length} profile photos...`,
    );

    const failedMessages: string[] = [];
    for (const { pendingId, asset } of pendingEntries) {
      try {
        const uploaded = await uploadMediaAsset({
          getToken,
          uri: asset.uri,
          contentType: asset.mimeType || 'image/jpeg',
          mediaType: 'profile',
          onProgress: (progress) => {
            setAvatarUploadProgress((prev) => {
              if (!(pendingId in prev)) {
                return prev;
              }
              return { ...prev, [pendingId]: progress };
            });
          },
        });

        const wasCanceled = canceledAvatarUploadsRef.current.has(pendingId);
        canceledAvatarUploadsRef.current.delete(pendingId);
        setAvatarUploadProgress((prev) => {
          const next = { ...prev };
          delete next[pendingId];
          return next;
        });
        if (wasCanceled) {
          continue;
        }

        const nextPhotos: UserProfilePhoto[] = latestProfileRef.current.photos.map((photo) =>
          photo.id === pendingId
            ? {
                id: `onboarding-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                uri: uploaded.publicUrl,
              }
            : photo,
        );
        commitPhotos(nextPhotos);
      } catch (error) {
        canceledAvatarUploadsRef.current.delete(pendingId);
        setAvatarUploadProgress((prev) => {
          const next = { ...prev };
          delete next[pendingId];
          return next;
        });

        const nextPhotos: UserProfilePhoto[] = latestProfileRef.current.photos.map((photo) =>
          photo.id === pendingId
            ? {
                id: `onboarding-avatar-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                uri: asset.uri,
              }
            : photo,
        );
        commitPhotos(nextPhotos);

        const message =
          error instanceof Error ? error.message : 'Could not sync that profile picture right now.';
        if (!isOnboardingUploadSignerUnreachable(error)) {
          failedMessages.push(message);
        }
      }
    }

    if (failedMessages.length > 0) {
      setErrorMessage(null);
      toast.info('Photo added. It will finish syncing when your session and upload route are ready.');
    } else {
      toast.success(nextAssets.length === 1 ? 'Profile photo added' : 'Profile photos added');
    }

    setIsUploadingAvatar(false);
  };

  const applyAvatarCrop = async () => {
    if (!avatarEditorAsset || !avatarCropMetrics || isApplyingAvatarCrop) {
      return;
    }

    setIsApplyingAvatarCrop(true);
    setErrorMessage(null);
    try {
      const hydratedAsset = await hydrateAvatarEditorAsset(avatarEditorAsset);
      const manipulatorUri = hydratedAsset.uri;
      if (Platform.OS === 'ios' && manipulatorUri.startsWith('ph://')) {
        closeAvatarEditor();
        await queueAvatarAssets([{ uri: avatarEditorAsset.uri, mimeType: 'image/jpeg' }]);
        toast.info('Photo added without custom crop in this runtime.');
        return;
      }
      const { sourceWidth, sourceHeight, displayWidth, displayHeight } = avatarCropMetrics;
      const cropWidth = avatarCropFrameWidth * (sourceWidth / displayWidth);
      const cropHeight = avatarCropFrameHeight * (sourceHeight / displayHeight);
      const originX =
        ((displayWidth - avatarCropFrameWidth) / 2 - avatarCropOffset.x) * (sourceWidth / displayWidth);
      const originY =
        ((displayHeight - avatarCropFrameHeight) / 2 - avatarCropOffset.y) * (sourceHeight / displayHeight);
      const outputWidth = Math.max(
        720,
        Math.min(AVATAR_CROP_OUTPUT_WIDTH, Math.round(cropWidth)),
      );
      const outputHeight = Math.round(outputWidth * (avatarCropFrameHeight / avatarCropFrameWidth));

      const cropped = await ImageManipulator.manipulateAsync(
        manipulatorUri,
        [
          {
            crop: {
              originX: Math.round(clamp(originX, 0, Math.max(0, sourceWidth - cropWidth))),
              originY: Math.round(clamp(originY, 0, Math.max(0, sourceHeight - cropHeight))),
              width: Math.round(Math.min(cropWidth, sourceWidth)),
              height: Math.round(Math.min(cropHeight, sourceHeight)),
            },
          },
          {
            resize: {
              width: outputWidth,
              height: outputHeight,
            },
          },
        ],
        {
          compress: AVATAR_CROP_JPEG_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      closeAvatarEditor();
      await queueAvatarAssets([{ uri: cropped.uri, mimeType: 'image/jpeg' }]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not prepare that photo right now.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsApplyingAvatarCrop(false);
    }
  };

  const handleUploadAvatar = async (source: 'library' | 'camera') => {
    if (isUploadingAvatar) {
      return;
    }
    if (isPreview) {
      toast.info('Avatar upload is disabled in preview mode.');
      return;
    }
    if (!canUploadMedia) {
      toast.error(
        needsVerification
          ? 'Verify your email before adding a profile picture.'
          : 'Finish creating your account before adding a profile picture.',
      );
      return;
    }

    setErrorMessage(null);
    try {
      if (source === 'library') {
        await openAvatarLibraryEditor();
      } else {
        await openAvatarCameraEditor();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not add that profile picture right now.';
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const handleCaptureVerification = async () => {
    if (isUploadingVerification) {
      return;
    }
    if (isPreview) {
      toast.info('Verification capture is disabled in preview mode.');
      return;
    }
    if (!canUploadMedia) {
      toast.error(
        needsVerification
          ? 'Verify your email before starting verification.'
          : 'Finish creating your account before starting verification.',
      );
      return;
    }

    setErrorMessage(null);
    let previousVerificationPhotoUri = latestProfileRef.current.verificationPhotoUri ?? '';
    try {
      const permission =
        verificationCameraPermission?.status === 'granted'
          ? verificationCameraPermission
          : await requestVerificationCameraPermission();
      if (permission.status !== 'granted') {
        toast.error('Camera access is required for verification.');
        return;
      }

      let capturedUri = '';
      let capturedMimeType = 'image/jpeg';
      if (verificationCameraRef.current && isVerificationCameraReady) {
        const result = await verificationCameraRef.current.takePictureAsync({
          quality: 0.88,
          shutterSound: false,
        });
        capturedUri = result?.uri ?? '';
      } else {
        const fallback = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: false,
          quality: 0.88,
          cameraType: ImagePicker.CameraType.front,
        });
        if (fallback.canceled || !fallback.assets.length || !fallback.assets[0]?.uri) {
          return;
        }
        capturedUri = fallback.assets[0].uri;
        capturedMimeType = fallback.assets[0].mimeType || 'image/jpeg';
      }
      if (!capturedUri) {
        return;
      }

      updateUserProfile({
        verificationPhotoUri: capturedUri,
      });

      setIsUploadingVerification(true);
      toast.info('Saving verification selfie...');
      try {
        const uploaded = await uploadMediaAsset({
          getToken,
          uri: capturedUri,
          contentType: capturedMimeType,
          mediaType: 'verification',
        });

        updateUserProfile({
          verificationPhotoUri: uploaded.publicUrl,
        });
        toast.success('Verification selfie saved');
      } catch (error) {
        if (isOnboardingUploadSignerUnreachable(error)) {
          toast.success('Verification selfie saved on this device for now.');
          return;
        }
        throw error;
      }
    } catch (error) {
      updateUserProfile({
        verificationPhotoUri: previousVerificationPhotoUri,
      });
      const message =
        error instanceof Error ? error.message : 'Could not save that verification photo right now.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsUploadingVerification(false);
    }
  };

  const handleContinue = () => {
    const trimmedName = draft.name.trim();
    const normalizedUsername = normalizeOnboardingUsername(draft.username);
    const normalizedBirthDate = parseBirthDate(draft.birthDate);
    const formattedBirthDate = normalizedBirthDate ? formatBirthDate(normalizedBirthDate) : '';
    const derivedAge = deriveAgeFromBirthDate(formattedBirthDate);

    if (currentStep === 'welcome') {
      const nextStep = readFirstIncompleteOnboardingStep(userProfile);
      goToStep(nextStep === 'finish' ? 'name' : nextStep);
      return;
    }

    if (currentStep === 'name') {
      if (trimmedName.length < 2) {
        setErrorMessage('Use at least two characters for your display name.');
        return;
      }
      if (normalizedUsername.length < 3) {
        setErrorMessage('Pick a username with at least three valid characters.');
        return;
      }

      updateUserProfile({
        name: trimmedName,
        username: normalizedUsername,
      });
      goToStep('age');
      return;
    }

    if (currentStep === 'age') {
      if (
        !formattedBirthDate ||
        derivedAge === null ||
        derivedAge < MIN_BIRTHDAY_AGE ||
        derivedAge > MAX_BIRTHDAY_AGE
      ) {
        setErrorMessage('Choose a valid birth date for someone between 13 and 99.');
        return;
      }

      updateUserProfile({
        birthDate: formattedBirthDate,
        age: derivedAge,
      });
      goToStep('gender');
      return;
    }

    if (currentStep === 'gender') {
      if (!isOnboardingGenderIdentity(draft.genderIdentity)) {
        setErrorMessage('Choose a gender option.');
        return;
      }

      updateUserProfile({
        genderIdentity: draft.genderIdentity,
      });
      goToStep('avatar');
      return;
    }

    if (currentStep === 'avatar') {
      if (!isPreview && !hasOnboardingAvatar(latestProfileRef.current)) {
        setErrorMessage('Add a profile picture before continuing.');
        return;
      }

      goToStep('verification');
      return;
    }

    if (currentStep === 'verification') {
      setCompletionStepUnlocked(true);
      goToStep('finish');
      return;
    }

    if (!isSignedIn) {
      setErrorMessage(
        syncError ?? 'We are still finishing your sign-in. Wait a moment, then enter VULU.',
      );
      return;
    }

    router.replace('/(tabs)');
  };

  const handleSkipVerification = () => {
    setCompletionStepUnlocked(true);
    goToStep('finish');
  };

  useEffect(() => {
    if (currentStep !== 'finish' || Platform.OS === 'web') {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const permission = await Notifications.getPermissionsAsync();
        if (!active) {
          return;
        }
        setNotificationPermission({
          status: permission.status,
          canAskAgain: permission.canAskAgain,
        });
      } catch {
        if (!active) {
          return;
        }
        setNotificationPermission({
          status: null,
          canAskAgain: true,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [currentStep]);

  const ensureFinishStepReady = () => {
    if (isSignedIn) {
      return true;
    }
    if (canEnterWithDegradedBackend) {
      if (!degradedFinishToastShownRef.current) {
        degradedFinishToastShownRef.current = true;
        toast.info(
          'The Vulu backend is unreachable from this device. You can still enter the app; reconnect the worker to use live features.',
        );
      }
      return true;
    }
    setErrorMessage(
      syncError ?? 'We are still finishing your sign-in. Wait a moment, then try again.',
    );
    return false;
  };

  const handleEnableNotifications = async () => {
    setErrorMessage(null);

    if (!ensureFinishStepReady()) {
      return;
    }

    if (Platform.OS === 'web') {
      toast.info('Notifications are not available in the web runtime.');
      router.replace('/(tabs)');
      return;
    }

    if (notificationPermission.status === 'granted') {
      router.replace('/(tabs)');
      return;
    }

    if (notificationPermission.status === 'denied' && !notificationPermission.canAskAgain) {
      toast.info('iOS will not show the popup again after denial. Enable notifications in Settings.');
      void Linking.openSettings().catch(() => undefined);
      return;
    }

    setIsRequestingNotifications(true);
    try {
      const existingPermission = await Notifications.getPermissionsAsync();
      let status = existingPermission.status;
      let canAskAgain = existingPermission.canAskAgain;
      setNotificationPermission({
        status,
        canAskAgain,
      });

      if (status !== 'granted' && canAskAgain) {
        const requestedPermission = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        status = requestedPermission.status;
        canAskAgain = requestedPermission.canAskAgain;
      }

      setNotificationPermission({
        status,
        canAskAgain,
      });

      if (status === 'granted') {
        toast.success('Notifications enabled.');
        router.replace('/(tabs)');
      } else if (!canAskAgain) {
        toast.info('Notifications were denied. Tap again to open Settings and re-enable them.');
      } else {
        toast.info('Notifications stayed off. You can try again or skip for now.');
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Could not request notification permissions right now.';
      toast.error(message);
    } finally {
      setIsRequestingNotifications(false);
    }
  };

  const handleBack = () => {
    setErrorMessage(null);

    if (currentStep === 'welcome') {
      if (canGoBackToAuth) {
        router.replace('/onboarding');
      }
      return;
    }

    if (currentStep === 'finish') {
      goToStep('verification');
      return;
    }

    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleOAuthContinue = async (provider: OAuthProvider) => {
    setErrorMessage(null);
    const config = OAUTH_PROVIDERS.find((item) => item.id === provider);
    if (!config) return;
    const providerName = 'Apple';

    if (isPreview) {
      handleContinue();
      return;
    }

    if (isSignedIn) {
      handleContinue();
      return;
    }

    setActiveOAuthProvider(provider);
    try {
      if (hasOnboardingSession) {
        await signOut();
      }
      const { createdSessionId, setActive, authSessionResult } = await startSSOFlow({
        strategy: config.strategy,
      });
      if (!createdSessionId || !setActive) {
        const message =
          authSessionResult?.type === 'cancel' || authSessionResult?.type === 'dismiss'
            ? `${providerName} sign-in was canceled.`
            : `${providerName} sign-in did not return an active Clerk session.`;
        setErrorMessage(message);
        toast.info(message);
        return;
      }
      await setActive({ session: createdSessionId });
      handleContinue();
    } catch (error) {
      const message = readOAuthErrorMessage(error, provider);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setActiveOAuthProvider(null);
    }
  };

  return (
    <AppScreen noPadding style={currentStep === 'welcome' ? styles.welcomeScreen : styles.lightScreen}>
      {currentStep === 'welcome' ? <WelcomeBackground /> : <LightBackground />}

      <View
        style={[
          styles.screenViewport,
          currentStep === 'welcome' ? styles.screenViewportWelcome : styles.screenViewportLight,
          {
            paddingHorizontal: isShortViewport ? spacing.lg : spacing.xl,
            paddingTop:
              currentStep === 'welcome'
                ? isShortViewport
                  ? spacing.md
                  : spacing.lg
                : isShortViewport
                  ? spacing.lg
                  : spacing.xl,
            paddingBottom:
              currentStep === 'welcome'
                ? isShortViewport
                  ? spacing.xl
                  : spacing.xxxl
                : spacing.screenBottom,
          },
        ]}
      >
        <View
          style={[
            styles.contentWrap,
            currentStep === 'welcome' ? styles.contentWrapWelcome : styles.contentWrapLight,
            { width: contentWidth },
          ]}
        >
          {currentStep !== 'welcome' ? (
            <>
              <View style={[styles.topBar, isShortViewport && styles.topBarCompact]}>
                <Pressable onPress={handleBack} style={styles.iconButton}>
                  <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                </Pressable>
                {currentStep === 'verification' ? (
                  <Pressable onPress={handleSkipVerification} style={styles.skipButton}>
                    <AppText variant="bodyBold" style={styles.skipButtonText}>
                      Skip for now
                    </AppText>
                  </Pressable>
                ) : (
                  <AppText variant="smallBold" style={styles.progressText}>
                    {currentScreenNumber} of {STEP_ORDER.length}
                  </AppText>
                )}
              </View>

              <View style={[styles.progressRow, isShortViewport && styles.progressRowCompact]}>
                {ACTIONABLE_STEPS.map((step, index) => {
                  const isActive = currentStep === 'finish' ? true : index < progressIndex;
                  return (
                    <View
                      key={step}
                      style={[
                        styles.progressPill,
                        styles.progressPillLight,
                        isActive && styles.progressPillActive,
                      ]}
                    />
                  );
                })}
              </View>
            </>
          ) : (
            <View
              style={[
                styles.progressRow,
                styles.progressRowWelcome,
                isShortViewport && styles.progressRowCompact,
                isShortViewport && styles.progressRowWelcomeCompact,
              ]}
            >
              {ACTIONABLE_STEPS.map((step, index) => (
                <View
                  key={step}
                  style={[
                    styles.progressPill,
                    styles.progressPillDark,
                    index === 0 && styles.progressPillActive,
                  ]}
                />
              ))}
            </View>
          )}

          {currentStep === 'welcome' ? (
            <View style={[styles.welcomeContent, isShortViewport && styles.welcomeContentCompact]}>
              <View style={[styles.welcomeHeroPanel, isShortViewport && styles.welcomeHeroPanelCompact]}>
                <View style={styles.brandMark}>
                  <Ionicons name="sparkles" size={42} color="#FFFFFF" />
                </View>

                <AppText variant="micro" style={styles.welcomeKicker}>
                  {currentConfig.eyebrow}
                </AppText>

                <AppText variant="h1" style={[styles.welcomeTitle, isShortViewport && styles.welcomeTitleCompact]}>
                  {currentConfig.title}
                </AppText>

                <AppText
                  variant="bodyLarge"
                  style={[styles.welcomeBody, isShortViewport && styles.welcomeBodyCompact]}
                >
                  {currentConfig.body}
                </AppText>

                <View style={styles.welcomeButtonStack}>
                  {OAUTH_PROVIDERS.map((provider) => (
                    <PillButton
                      key={provider.id}
                      title={provider.title}
                      onPress={() => {
                        void handleOAuthContinue(provider.id);
                      }}
                      variant="secondary"
                      icon={provider.icon}
                      disabled={Boolean(activeOAuthProvider)}
                      style={styles.welcomeAppleButton}
                    />
                  ))}
                  {activeOAuthProvider ? (
                    <View style={styles.uploadRowCompact}>
                      <ActivityIndicator size="small" color="#10B981" />
                      <AppText variant="small" style={styles.uploadText}>
                        Connecting to Apple...
                      </AppText>
                    </View>
                  ) : null}
                  <AppText variant="small" style={styles.welcomeLegalText}>
                    By continuing, you agree to our Terms & Privacy Policy
                  </AppText>
                </View>
              </View>
            </View>
          ) : null}

          {currentStep === 'name' ? (
            <View style={[styles.stepScreen, isShortViewport && styles.stepScreenCompact]}>
              <AppText variant="micro" style={styles.stepEyebrow}>
                {currentConfig.eyebrow}
              </AppText>
              <AppText variant="h1" style={[styles.stepTitle, isShortViewport && styles.stepTitleCompact]}>
                {currentConfig.title}
              </AppText>
              {currentConfig.body ? (
                <AppText variant="bodyLarge" style={[styles.stepBody, isShortViewport && styles.stepBodyCompact]}>
                  {currentConfig.body}
                </AppText>
              ) : null}

              <View style={styles.fieldBlock}>
                <AppText variant="bodyLarge" style={styles.fieldLabel}>
                  DISPLAY NAME
                </AppText>
                <AppTextInput
                  value={draft.name}
                  onChangeText={handleNameChange}
                  placeholder="Enter your name"
                  style={styles.mainInput}
                />
                <AppText variant="small" style={styles.helperText}>
                  {draft.name.trim().length}/24
                </AppText>
              </View>

              <View style={styles.fieldBlock}>
                <AppText variant="bodyLarge" style={styles.fieldLabel}>
                  USERNAME
                </AppText>
                <View style={styles.usernameRow}>
                  <View style={styles.usernamePrefix}>
                    <AppText variant="bodyBold" style={styles.usernamePrefixText}>
                      @
                    </AppText>
                  </View>
                  <AppTextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={draft.username}
                    onChangeText={(value) => {
                      setUsernameTouched(true);
                      syncDraft({
                        username: normalizeOnboardingUsername(value).replace(/^[0-9]+/, ''),
                      });
                    }}
                    placeholder="username"
                    style={[styles.mainInput, styles.usernameInput]}
                  />
                </View>
                <AppText
                  variant="small"
                  style={[
                    styles.helperText,
                    normalizeOnboardingUsername(draft.username).length >= 3
                      ? styles.helperTextSuccess
                      : undefined,
                  ]}
                >
                  {normalizeOnboardingUsername(draft.username).length >= 3
                    ? 'Username looks good'
                    : 'Username must be 3-20 characters'}
                </AppText>
              </View>
            </View>
          ) : null}

          {currentStep === 'age' ? (
            <View style={[styles.stepScreen, isShortViewport && styles.stepScreenCompact]}>
              <AppText variant="micro" style={styles.stepEyebrow}>
                {currentConfig.eyebrow}
              </AppText>
              <AppText variant="h1" style={[styles.stepTitle, isShortViewport && styles.stepTitleCompact]}>
                {currentConfig.title}
              </AppText>
              {currentConfig.body ? (
                <AppText variant="bodyLarge" style={[styles.stepBody, isShortViewport && styles.stepBodyCompact]}>
                  {currentConfig.body}
                </AppText>
              ) : null}

              <View style={styles.fieldBlock}>
                <AppText variant="bodyLarge" style={styles.fieldLabel}>
                  Date of Birth
                </AppText>
                {Platform.OS !== 'web' ? (
                  <Pressable
                    onPress={openNativeBirthdayPicker}
                    style={styles.birthInputField}
                  >
                    <AppText
                      variant="bodyLarge"
                      style={[
                        styles.birthInputValue,
                        !hasSelectedBirthDate && styles.birthInputPlaceholder,
                      ]}
                    >
                      {hasSelectedBirthDate ? formattedBirthdayLabel : 'MM/DD/YYYY'}
                    </AppText>
                    <Ionicons name="chevron-down" size={20} color="#6B7288" />
                  </Pressable>
                ) : null}

                {Platform.OS === 'web' ? (
                  <View style={styles.birthInputField}>
                    <AppText
                      variant="bodyLarge"
                      style={[
                        styles.birthInputValue,
                        !hasSelectedBirthDate && styles.birthInputPlaceholder,
                      ]}
                    >
                      {hasSelectedBirthDate ? formattedBirthdayLabel : 'MM/DD/YYYY'}
                    </AppText>
                    <Ionicons name="calendar-outline" size={20} color="#6B7288" />
                    <input
                      type="date"
                      min={minimumBirthdayValue}
                      max={maximumBirthdayValue}
                      value={draft.birthDate}
                      aria-label="Date of birth"
                      onChange={(event) => {
                        const nextBirthDate = event.currentTarget.value;
                        syncDraft({
                          birthDate: parseBirthDate(nextBirthDate)
                            ? nextBirthDate
                            : '',
                        });
                      }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: 0,
                        cursor: 'pointer',
                      }}
                    />
                  </View>
                ) : null}

                <AppText variant="small" style={styles.birthInputMeta}>
                  {selectedBirthdayAge !== null
                    ? `${selectedBirthdayAge} years old`
                    : 'You must be between 13 and 99 years old to continue.'}
                </AppText>
              </View>

              {Platform.OS === 'ios' ? (
                <Modal
                  visible={isNativeBirthdayPickerOpen}
                  transparent
                  animationType="slide"
                  onRequestClose={closeNativeBirthdayPicker}
                >
                  <View style={styles.birthModalBackdrop}>
                    <Pressable style={styles.birthModalScrim} onPress={closeNativeBirthdayPicker} />
                    <View style={styles.birthModalSheet}>
                      <AppText variant="bodyBold" style={styles.birthModalTitle}>
                        Date of Birth
                      </AppText>
                      <View style={styles.birthModalPickerSurface}>
                        <DateTimePicker
                          value={pendingNativeBirthDate ?? selectedBirthDateValue}
                          mode="date"
                          display="spinner"
                          minimumDate={minimumBirthdayDate}
                          maximumDate={maximumBirthdayDate}
                          onChange={handleNativeBirthdayChange}
                          textColor="#F4F4F5"
                          accentColor="#10B981"
                          themeVariant="dark"
                          style={styles.birthModalPicker}
                        />
                      </View>
                      <Pressable onPress={confirmNativeBirthdayPicker} style={styles.birthModalPrimaryAction}>
                        <AppText variant="bodyBold" style={styles.birthModalPrimaryActionText}>
                          Confirm
                        </AppText>
                      </Pressable>
                      <Pressable onPress={closeNativeBirthdayPicker} style={styles.birthModalSecondaryAction}>
                        <AppText variant="bodyBold" style={styles.birthModalSecondaryActionText}>
                          Cancel
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                </Modal>
              ) : null}
            </View>
          ) : null}

          {currentStep === 'gender' ? (
            <View style={[styles.stepScreen, isShortViewport && styles.stepScreenCompact]}>
              <AppText variant="micro" style={styles.stepEyebrow}>
                {currentConfig.eyebrow}
              </AppText>
              <AppText variant="h1" style={[styles.stepTitle, isShortViewport && styles.stepTitleCompact]}>
                {currentConfig.title}
              </AppText>
              {currentConfig.body ? (
                <AppText variant="bodyLarge" style={[styles.stepBody, isShortViewport && styles.stepBodyCompact]}>
                  {currentConfig.body}
                </AppText>
              ) : null}

              <View style={styles.optionStack}>
                {onboardingGenderOptions.map((option) => (
                  <OptionCard
                    key={option.id}
                    label={option.label}
                    selected={draft.genderIdentity === option.id}
                    onPress={() => syncDraft({ genderIdentity: option.id })}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {currentStep === 'avatar' ? (
            <View style={[styles.stepScreen, styles.avatarStepScreen, isShortViewport && styles.stepScreenCompact]}>
              <View style={styles.avatarHeaderBlock}>
                <AppText variant="micro" style={styles.stepEyebrow}>
                  {currentConfig.eyebrow}
                </AppText>
                <View style={styles.avatarHeaderRow}>
                  <AppText variant="h1" style={[styles.stepTitle, styles.avatarStepTitle]}>
                    {currentConfig.title}
                  </AppText>
                  <View style={styles.avatarCountChip}>
                    <AppText variant="smallBold" style={styles.avatarCountChipText}>
                      {visibleAvatarPhotos.length}/{MAX_ONBOARDING_PHOTOS}
                    </AppText>
                  </View>
                </View>
                <AppText variant="small" style={styles.stepBodyLeft}>
                  {currentConfig.body}
                </AppText>
              </View>

              {pendingAvatarPhotos.length > 0 ? (
                <View style={styles.avatarInlineUpload}>
                  <View style={styles.avatarInlineUploadTrack}>
                    <View style={[styles.avatarInlineUploadFill, { width: avatarProgressWidth }]} />
                  </View>
                  <AppText variant="small" style={styles.avatarInlineUploadText}>
                    Uploading {pendingAvatarPhotos.length}
                  </AppText>
                </View>
              ) : null}

              <View style={styles.avatarHeroRow}>
                <Pressable
                  onPress={() => {
                    if (photoPreviewUri) {
                      setIsAvatarProfilePreviewVisible(true);
                    }
                  }}
                  disabled={!photoPreviewUri}
                  style={[
                    styles.avatarPortraitCard,
                    isShortViewport && styles.avatarPortraitCardCompact,
                    !photoPreviewUri && styles.avatarPortraitCardDisabled,
                  ]}
                >
                  {photoPreviewUri ? (
                    <Image
                      source={{ uri: photoPreviewUri }}
                      style={[styles.avatarPortraitImage, isShortViewport && styles.avatarPortraitImageCompact]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.avatarPortraitPlaceholder,
                        isShortViewport && styles.avatarPortraitPlaceholderCompact,
                      ]}
                    >
                      <Ionicons name="image-outline" size={34} color="#5E616C" />
                    </View>
                  )}
                  <View style={styles.avatarMainBadge}>
                    <AppText variant="micro" style={styles.avatarMainBadgeText}>
                      AVATAR
                    </AppText>
                  </View>
                  <View style={styles.avatarCirclePreview}>
                    {photoPreviewUri ? (
                      <Image source={{ uri: photoPreviewUri }} style={styles.avatarCirclePreviewImage} />
                    ) : (
                      <Ionicons name="person" size={28} color="#5E616C" />
                    )}
                  </View>
                </Pressable>

                <View style={styles.avatarQuickActions}>
                  {remainingAvatarSlots > 0 ? (
                    <Pressable
                      onPress={() => {
                        void handleUploadAvatar('library');
                      }}
                      style={[
                        styles.avatarAddTile,
                        styles.avatarQuickActionPrimary,
                        isUploadingAvatar && styles.avatarAddTileDisabled,
                      ]}
                      disabled={isUploadingAvatar}
                    >
                      <View style={styles.avatarAddTileIcon}>
                        <Ionicons name="images-outline" size={28} color="#111521" />
                      </View>
                      <AppText variant="smallBold" style={styles.avatarAddTileTitle}>
                        Photos
                      </AppText>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => {
                      void handleUploadAvatar('camera');
                    }}
                    style={[
                      styles.avatarQuickActionSecondary,
                      (isUploadingAvatar || remainingAvatarSlots === 0) && styles.avatarAddTileDisabled,
                    ]}
                    disabled={isUploadingAvatar || remainingAvatarSlots === 0}
                  >
                    <Ionicons name="camera-outline" size={20} color="#111521" />
                  </Pressable>
                </View>
              </View>

              <View style={[styles.avatarRailArea, isShortViewport && styles.avatarRailAreaCompact]} {...avatarRailPanResponder.panHandlers}>
                <ScrollView
                  horizontal
                  scrollEnabled={avatarDragState === null}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.avatarRail}
                  onScroll={(event) => {
                    avatarRailScrollOffsetRef.current = event.nativeEvent.contentOffset.x;
                  }}
                  scrollEventThrottle={16}
                >
                  {displayAvatarPhotos.map((photo, index) => {
                  const isPending = photo.id.startsWith(PENDING_AVATAR_ID_PREFIX);
                  const isMain = userProfile.avatarUrl === photo.uri || (!userProfile.avatarUrl && index === 0);
                  const progress = avatarUploadProgress[photo.id] ?? 0;
                  const isDragged = avatarDragState?.photoId === photo.id;
                  return (
                    <Pressable
                      key={photo.id}
                      delayLongPress={180}
                      onLongPress={() => {
                        if (!isPending) {
                          beginAvatarDrag(photo.id);
                        }
                      }}
                      onPressOut={() => {
                        const activeDrag = avatarDragStateRef.current;
                        if (activeDrag?.photoId === photo.id) {
                          if (avatarDragReleaseTimerRef.current) {
                            clearTimeout(avatarDragReleaseTimerRef.current);
                          }
                          avatarDragReleaseTimerRef.current = setTimeout(() => {
                            const latestDrag = avatarDragStateRef.current;
                            if (
                              latestDrag?.photoId === photo.id &&
                              latestDrag.currentIndex === latestDrag.startIndex
                            ) {
                              resetAvatarDrag();
                            }
                            avatarDragReleaseTimerRef.current = null;
                          }, 120);
                        }
                      }}
                      onPress={() => {
                        if (!isPending && !avatarDragStateRef.current) {
                          updateAvatar(photo.uri);
                        }
                      }}
                      style={[
                        styles.avatarRailTile,
                        { width: avatarTileWidth, height: avatarTileHeight },
                        isMain && styles.avatarRailTileMain,
                        isDragged && styles.avatarRailTileDragging,
                      ]}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.avatarRailTileImage} />
                      <View style={styles.avatarRailTileShade} />
                      <View style={styles.avatarRailTileTopRow}>
                        <View style={[styles.avatarIndexBadge, isMain && styles.avatarIndexBadgeMain]}>
                          <AppText variant="micro" style={styles.avatarIndexBadgeText}>
                            {index + 1}
                          </AppText>
                        </View>
                        <Pressable
                          hitSlop={10}
                          onPress={(event) => {
                            event.stopPropagation();
                            handleRemoveAvatarPhoto(photo.id);
                          }}
                          style={styles.avatarRemoveButton}
                        >
                          <Ionicons name="close" size={16} color="#1A1D29" />
                        </Pressable>
                      </View>
                      <View style={styles.avatarRailTileFooter}>
                        {isMain ? (
                          <AppText variant="smallBold" style={styles.avatarRailTileLabel}>
                            Avatar
                          </AppText>
                        ) : null}
                        {isPending ? (
                          <View style={styles.avatarTileProgressTrack}>
                            <View
                              style={[
                                styles.avatarTileProgressFill,
                                { width: `${Math.max(8, progress)}%` as `${number}%` },
                              ]}
                            />
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                  })}
                </ScrollView>

                {draggingAvatarPhoto ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.avatarDragOverlay,
                      {
                        width: avatarTileWidth,
                        height: avatarTileHeight,
                        left: avatarDragOverlayLeft,
                      },
                      {
                        transform: avatarDragTranslation.getTranslateTransform(),
                      },
                    ]}
                  >
                    <Image source={{ uri: draggingAvatarPhoto.uri }} style={styles.avatarRailTileImage} />
                    <View style={styles.avatarRailTileShade} />
                    <View style={styles.avatarRailTileTopRow}>
                      <View style={styles.avatarIndexBadge}>
                        <AppText variant="micro" style={styles.avatarIndexBadgeText}>
                          {avatarDragState?.currentIndex !== undefined
                            ? avatarDragState.currentIndex + 1
                            : 1}
                        </AppText>
                      </View>
                    </View>
                  </Animated.View>
                ) : null}
              </View>

              {visibleAvatarPhotos.length > 1 ? (
                <AppText variant="small" style={styles.avatarFooterHint}>
                  Hold to sort
                </AppText>
              ) : null}
            </View>
          ) : null}

          {currentStep === 'verification' ? (
            <View style={[styles.stepScreen, styles.verificationStepScreen, isShortViewport && styles.stepScreenCompact]}>
              <AppText variant="micro" style={styles.stepEyebrow}>
                {currentConfig.eyebrow}
              </AppText>
              <AppText variant="h1" style={[styles.stepTitle, styles.verificationStepTitle]}>
                {currentConfig.title}
              </AppText>
              {currentConfig.body ? (
                <AppText variant="bodyLarge" style={styles.stepBody}>
                  {currentConfig.body}
                </AppText>
              ) : null}

              <View
                style={[
                  styles.verificationFrame,
                  isShortViewport && styles.verificationFrameCompact,
                  { height: verificationFrameHeight },
                ]}
              >
                {userProfile.verificationPhotoUri ? (
                  <Image source={{ uri: userProfile.verificationPhotoUri }} style={styles.verificationImage} />
                ) : verificationCameraPermission?.status === 'granted' ? (
                  <CameraView
                    ref={verificationCameraRef}
                    style={styles.verificationCamera}
                    facing="front"
                    mode="picture"
                    mirror
                    active={currentStep === 'verification'}
                    onCameraReady={() => {
                      setIsVerificationCameraReady(true);
                    }}
                  />
                ) : (
                  <View style={styles.verificationPlaceholder}>
                    <Ionicons name="camera-outline" size={34} color="#131313" />
                    <AppText variant="smallBold" style={styles.verificationCameraHintText}>
                      Allow camera access
                    </AppText>
                  </View>
                )}
                <View
                  pointerEvents="none"
                  style={[styles.verificationOval, isShortViewport && styles.verificationOvalCompact]}
                />
              </View>

              <View style={styles.verificationWarning}>
                <Ionicons name="bulb-outline" size={22} color="#131313" />
                <AppText variant="bodyBold" style={styles.verificationWarningText}>
                  Make sure there&apos;s enough light.
                </AppText>
              </View>

              <PillButton
                title={
                  verificationCameraPermission?.status === 'granted'
                    ? userProfile.verificationPhotoUri
                      ? 'Take another picture'
                      : 'Take picture'
                    : 'Allow camera'
                }
                onPress={() => {
                  void handleCaptureVerification();
                }}
                disabled={isUploadingVerification}
              />

              {isUploadingVerification ? (
                <View style={styles.uploadRow}>
                  <ActivityIndicator size="small" color="#5D61F6" />
                  <AppText variant="small" style={styles.uploadText}>
                    Saving your verification selfie...
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          {currentStep === 'finish' ? (
            <View style={[styles.stepScreen, isShortViewport && styles.stepScreenCompact]}>
              <AppText variant="micro" style={styles.stepEyebrow}>
                {currentConfig.eyebrow}
              </AppText>
              <AppText variant="h1" style={[styles.stepTitle, isShortViewport && styles.stepTitleCompact]}>
                {currentConfig.title}
              </AppText>
              {currentConfig.body ? (
                <AppText variant="bodyLarge" style={[styles.stepBody, isShortViewport && styles.stepBodyCompact]}>
                  {currentConfig.body}
                </AppText>
              ) : null}

              <View style={styles.notificationsStack}>
                <View style={styles.notificationBenefitCard}>
                  <View style={[styles.notificationIconWrap, styles.notificationIconWrapRed]}>
                    <Ionicons name="radio" size={18} color="#F87171" />
                  </View>
                  <View style={styles.notificationBenefitTextWrap}>
                    <AppText variant="smallBold" style={styles.notificationBenefitTitle}>
                      LIVE STREAMS
                    </AppText>
                    <AppText variant="small" style={styles.notificationBenefitBody}>
                      Know when friends go live.
                    </AppText>
                  </View>
                </View>

                <View style={styles.notificationBenefitCard}>
                  <View style={[styles.notificationIconWrap, styles.notificationIconWrapGreen]}>
                    <Ionicons name="chatbubble-ellipses" size={18} color="#10B981" />
                  </View>
                  <View style={styles.notificationBenefitTextWrap}>
                    <AppText variant="smallBold" style={styles.notificationBenefitTitle}>
                      MESSAGES
                    </AppText>
                    <AppText variant="small" style={styles.notificationBenefitBody}>
                      Never miss a message from friends.
                    </AppText>
                  </View>
                </View>
              </View>

              <View style={styles.notificationsFooter}>
                <PillButton
                  title={notificationButtonTitle}
                  onPress={() => {
                    void handleEnableNotifications();
                  }}
                  disabled={isRequestingNotifications}
                />
                <Pressable
                  onPress={() => {
                    if (!ensureFinishStepReady()) {
                      return;
                    }
                    router.replace('/(tabs)');
                  }}
                  style={styles.notificationsSkipButton}
                >
                  <AppText variant="small" style={styles.notificationsSkipText}>
                    I&apos;ll do this later
                  </AppText>
                </Pressable>
                {canEnterWithDegradedBackend ? (
                  <View style={styles.finishNotice}>
                    <Ionicons name="cloud-offline-outline" size={18} color="#F59E0B" />
                    <AppText variant="small" style={styles.finishNoticeText}>
                      The Vulu backend at your configured URL is not reachable from this device. You can
                      enter the app now; fix EXPO_PUBLIC_RAILWAY_API_BASE_URL or your network for full sync.
                    </AppText>
                  </View>
                ) : null}
                {finishPendingMessage ? (
                  <View style={styles.finishNotice}>
                    <Ionicons name="time-outline" size={18} color="#10B981" />
                    <AppText variant="small" style={styles.finishNoticeText}>
                      {finishPendingMessage}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#CF4457" />
              <AppText variant="small" style={styles.errorBannerText}>
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          {currentStep !== 'welcome' && currentStep !== 'finish' ? (
            <View style={[styles.footer, isShortViewport && styles.footerCompact]}>
              <PillButton
                title="Continue"
                onPress={handleContinue}
                icon="chevron-forward"
                disabled={isStepActionDisabled}
              />
            </View>
          ) : null}
        </View>
      </View>

      <Modal
        visible={isAvatarEditorVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeAvatarEditor}
      >
        <View style={styles.avatarEditorModal}>
          <View style={styles.avatarEditorHeader}>
            <Pressable onPress={closeAvatarEditor} style={styles.avatarEditorHeaderButton}>
              <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
            </Pressable>
            <AppText variant="bodyBold" style={styles.avatarEditorHeaderTitle}>
              {avatarEditorSource === 'camera' ? 'Adjust photo' : 'Choose your photo'}
            </AppText>
            <Pressable
              onPress={() => {
                void applyAvatarCrop();
              }}
              style={[
                styles.avatarEditorDoneButton,
                (!avatarEditorAsset || isApplyingAvatarCrop) && styles.avatarEditorDoneButtonDisabled,
              ]}
              disabled={!avatarEditorAsset || isApplyingAvatarCrop}
            >
              {isApplyingAvatarCrop ? (
                <ActivityIndicator size="small" color="#0E111A" />
              ) : (
                <AppText variant="smallBold" style={styles.avatarEditorDoneButtonText}>
                  Use photo
                </AppText>
              )}
            </Pressable>
          </View>

          <View style={styles.avatarEditorCropStage}>
            <View style={styles.avatarEditorCropFrame} {...avatarCropPanResponder.panHandlers}>
              {avatarEditorAsset && avatarCropMetrics ? (
                <Image
                  source={{ uri: avatarEditorAsset.uri }}
                  style={[
                    styles.avatarEditorCropImage,
                    {
                      width: avatarCropMetrics.displayWidth,
                      height: avatarCropMetrics.displayHeight,
                      transform: [
                        { translateX: avatarCropOffset.x },
                        { translateY: avatarCropOffset.y },
                      ],
                    },
                  ]}
                />
              ) : (
                <View style={styles.avatarEditorCropPlaceholder}>
                  {isLoadingAvatarEditorAssets ? (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="images-outline" size={34} color="rgba(255,255,255,0.64)" />
                      <AppText variant="small" style={styles.avatarEditorPlaceholderText}>
                        Pick a photo below to adjust it inside the Vulu profile frame.
                      </AppText>
                    </>
                  )}
                </View>
              )}
              <View pointerEvents="none" style={styles.avatarEditorCropShadeTop} />
              <View pointerEvents="none" style={styles.avatarEditorCropShadeBottom} />
              <View pointerEvents="none" style={styles.avatarEditorCropShadeLeft} />
              <View pointerEvents="none" style={styles.avatarEditorCropShadeRight} />
            </View>

            <View style={styles.avatarEditorPreviewRow}>
              <View style={styles.avatarEditorPreviewCard}>
                {avatarEditorAsset ? (
                  <Image
                    source={{ uri: avatarEditorAsset.uri }}
                    style={[
                      styles.avatarEditorPreviewCardImage,
                      avatarCropMetrics
                        ? {
                            width: avatarCropMetrics.displayWidth,
                            height: avatarCropMetrics.displayHeight,
                            transform: [
                              { translateX: avatarCropOffset.x * 0.34 },
                              { translateY: avatarCropOffset.y * 0.34 },
                            ],
                          }
                        : null,
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.avatarEditorPreviewCircle}>
                {avatarEditorAsset ? (
                  <Image
                    source={{ uri: avatarEditorAsset.uri }}
                    style={[
                      styles.avatarEditorPreviewCircleImage,
                      avatarCropMetrics
                        ? {
                            width: avatarCropMetrics.displayWidth * 0.36,
                            height: avatarCropMetrics.displayHeight * 0.36,
                            transform: [
                              { translateX: avatarCropOffset.x * 0.12 },
                              { translateY: avatarCropOffset.y * 0.12 },
                            ],
                          }
                        : null,
                    ]}
                  />
                ) : null}
              </View>
            </View>

            <View style={styles.avatarEditorZoomBlock}>
              <AppText variant="small" style={styles.avatarEditorZoomLabel}>
                Zoom to fit the frame
              </AppText>
              <Slider
                minimumValue={1}
                maximumValue={AVATAR_CROP_MAX_SCALE}
                step={0.01}
                minimumTrackTintColor="#FFD900"
                maximumTrackTintColor="rgba(255,255,255,0.24)"
                thumbTintColor="#FFFFFF"
                value={avatarCropScale}
                onValueChange={handleAvatarCropZoomChange}
              />
            </View>
          </View>

          {avatarEditorSource === 'library' ? (
            <View style={styles.avatarEditorLibrarySection}>
              <AppText variant="smallBold" style={styles.avatarEditorLibraryTitle}>
                Photos
              </AppText>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.avatarEditorLibraryGrid}
              >
                {avatarEditorAssets.map((asset) => {
                  const selected = asset.id === avatarEditorAsset?.id;
                  return (
                    <Pressable
                      key={asset.id}
                      onPress={() => {
                        void (async () => {
                          const hydratedAsset = await hydrateAvatarEditorAsset(asset);
                          setAvatarEditorAsset(hydratedAsset);
                        })();
                      }}
                      style={[styles.avatarEditorLibraryTile, selected && styles.avatarEditorLibraryTileSelected]}
                    >
                      <Image source={{ uri: asset.uri }} style={styles.avatarEditorLibraryTileImage} />
                      <View style={styles.avatarEditorLibraryTileShade} />
                      {selected ? (
                        <View style={styles.avatarEditorLibrarySelectedBadge}>
                          <Ionicons name="checkmark" size={16} color="#0E111A" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={isAvatarProfilePreviewVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setIsAvatarProfilePreviewVisible(false);
        }}
      >
        <View style={styles.avatarProfilePreviewModal}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setIsAvatarProfilePreviewVisible(false);
            }}
          />
          <View style={styles.avatarProfilePreviewTopBar}>
            <Pressable
              onPress={() => {
                setIsAvatarProfilePreviewVisible(false);
              }}
              style={styles.avatarProfilePreviewDownButton}
            >
              <Ionicons name="chevron-down" size={30} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={styles.avatarProfilePreviewCard}>
            {photoPreviewUri ? (
              <Image source={{ uri: photoPreviewUri }} style={styles.avatarProfilePreviewImage} />
            ) : (
              <View style={styles.avatarProfilePreviewFallback} />
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.42)']}
              locations={[0, 0.38, 1]}
              style={styles.avatarProfilePreviewImageShade}
            />
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const welcomeCardShadow = Platform.select({
  web: {
    boxShadow: '0px 24px 80px rgba(0, 0, 0, 0.22)',
  },
  default: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
  },
});

const styles = StyleSheet.create({
  welcomeScreen: {
    backgroundColor: '#000000',
  },
  lightScreen: {
    backgroundColor: '#000000',
  },
  screenViewport: {
    flex: 1,
    alignItems: 'center',
  },
  screenViewportWelcome: {
    justifyContent: 'flex-start',
  },
  screenViewportLight: {
    justifyContent: 'flex-start',
  },
  contentWrap: {
    maxWidth: 520,
  },
  contentWrapWelcome: {
    alignItems: 'stretch',
    flex: 1,
  },
  contentWrapLight: {
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  progressRowCompact: {
    marginBottom: spacing.lg,
  },
  progressRowWelcome: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  progressRowWelcomeCompact: {
    marginTop: 0,
    marginBottom: spacing.md,
  },
  progressPill: {
    flex: 1,
    height: 6,
    borderRadius: radius.full,
  },
  progressPillDark: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  progressPillLight: {
    backgroundColor: '#27272A',
  },
  progressPillActive: {
    backgroundColor: '#10B981',
  },
  welcomeContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  welcomeContentCompact: {
    justifyContent: 'center',
  },
  welcomeHeroPanel: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.16)',
    backgroundColor: 'rgba(7,10,9,0.72)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    ...welcomeCardShadow,
  },
  welcomeHeroPanelCompact: {
    borderRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  brandMark: {
    width: 110,
    height: 110,
    borderRadius: radius.full,
    backgroundColor: '#0B0F0D',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  welcomeKicker: {
    color: '#34D399',
    letterSpacing: 4,
    marginBottom: spacing.sm,
  },
  welcomeTitle: {
    color: '#FFFFFF',
    fontSize: 52,
    lineHeight: 58,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  welcomeTitleCompact: {
    fontSize: 48,
    lineHeight: 52,
    marginBottom: spacing.md,
  },
  welcomeBody: {
    color: '#D4D4D8',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: spacing.xxl,
  },
  welcomeBodyCompact: {
    lineHeight: 28,
    marginBottom: spacing.xl,
  },
  welcomeButtonStack: {
    width: '100%',
    gap: spacing.md,
  },
  welcomeAppleButton: {
    minHeight: 68,
    backgroundColor: '#0A0F0D',
    borderWidth: 1.5,
    borderColor: 'rgba(16,185,129,0.68)',
  },
  welcomeLegalText: {
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  topBarCompact: {
    marginBottom: spacing.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  skipButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  skipButtonText: {
    color: '#A1A1AA',
  },
  progressText: {
    color: '#71717A',
  },
  stepScreen: {
    gap: spacing.xl,
  },
  stepScreenCompact: {
    gap: spacing.lg,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 48,
    textAlign: 'left',
  },
  stepTitleCompact: {
    fontSize: 34,
    lineHeight: 38,
  },
  stepBody: {
    color: '#A1A1AA',
    textAlign: 'left',
    lineHeight: 24,
  },
  stepBodyCompact: {
    lineHeight: 26,
  },
  stepEyebrow: {
    color: '#71717A',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  stepBodyLeft: {
    color: '#A1A1AA',
    textAlign: 'left',
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: '#71717A',
    fontSize: 13,
    letterSpacing: 1.2,
  },
  mainInput: {
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    color: '#FFFFFF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdPlus,
    fontSize: 18,
  },
  helperText: {
    color: '#71717A',
  },
  helperTextSuccess: {
    color: '#10B981',
  },
  usernameRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  usernamePrefix: {
    width: 64,
    borderRadius: 24,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usernamePrefixText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  usernameInput: {
    flex: 1,
  },
  birthInputField: {
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  birthInputValue: {
    color: '#FFFFFF',
    flex: 1,
  },
  birthInputPlaceholder: {
    color: '#71717A',
  },
  birthInputMeta: {
    color: '#71717A',
  },
  birthModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  birthModalScrim: {
    flex: 1,
  },
  birthModalSheet: {
    backgroundColor: '#111113',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  birthModalTitle: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  birthModalPickerSurface: {
    borderRadius: 22,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  birthModalPicker: {
    alignSelf: 'center',
  },
  birthModalPrimaryAction: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthModalPrimaryActionText: {
    color: '#000000',
    fontSize: 18,
  },
  birthModalSecondaryAction: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthModalSecondaryActionText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  privateBanner: {
    borderRadius: 24,
    backgroundColor: '#F1F3FF',
    borderWidth: 1,
    borderColor: '#E1E4FF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xxs,
  },
  privateBannerTitle: {
    color: '#1A2140',
  },
  privateBannerText: {
    color: '#5E6477',
  },
  optionStack: {
    gap: spacing.sm,
  },
  optionCard: {
    borderRadius: 22,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionCardSelected: {
    backgroundColor: '#18181B',
    borderColor: '#10B981',
  },
  optionCardPressed: {
    opacity: 0.93,
  },
  optionCardLabel: {
    color: '#FFFFFF',
  },
  optionCardSubtitle: {
    color: '#71717A',
    marginTop: spacing.xxs,
  },
  avatarHeaderBlock: {
    gap: spacing.xs,
  },
  avatarStepScreen: {
    gap: spacing.sm,
  },
  avatarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarStepTitle: {
    fontSize: 28,
    lineHeight: 32,
    textAlign: 'left',
  },
  avatarCountChip: {
    minWidth: 64,
    borderRadius: radius.full,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCountChipText: {
    color: '#FFFFFF',
  },
  avatarInlineUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarInlineUploadTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: '#18181B',
    overflow: 'hidden',
  },
  avatarInlineUploadFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: '#10B981',
  },
  avatarInlineUploadText: {
    color: '#10B981',
  },
  avatarHeroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  avatarPortraitCard: {
    width: 148,
    borderRadius: 26,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
    position: 'relative',
    ...welcomeCardShadow,
  },
  avatarPortraitCardCompact: {
    width: 132,
  },
  avatarPortraitCardDisabled: {
    opacity: 0.88,
  },
  avatarPortraitImage: {
    width: '100%',
    height: 196,
  },
  avatarPortraitImageCompact: {
    height: 176,
  },
  avatarPortraitPlaceholder: {
    width: '100%',
    height: 196,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPortraitPlaceholderCompact: {
    height: 176,
  },
  avatarMainBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(17, 21, 33, 0.84)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  avatarMainBadgeText: {
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  avatarCirclePreview: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 58,
    height: 58,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarCirclePreviewImage: {
    width: '100%',
    height: '100%',
  },
  avatarQuickActions: {
    width: 82,
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  avatarRailArea: {
    position: 'relative',
    minHeight: 160,
  },
  avatarRailAreaCompact: {
    minHeight: 140,
  },
  avatarRail: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  avatarRailTile: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#18181B',
    position: 'relative',
    ...welcomeCardShadow,
  },
  avatarRailTileDragging: {
    opacity: 0.2,
  },
  avatarRailTileMain: {
    borderWidth: 3,
    borderColor: '#FFD900',
  },
  avatarRailTileImage: {
    width: '100%',
    height: '100%',
  },
  avatarRailTileShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 14, 22, 0.16)',
  },
  avatarRailTileTopRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarIndexBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  avatarIndexBadgeMain: {
    backgroundColor: '#FFD900',
  },
  avatarIndexBadgeText: {
    color: '#111521',
  },
  avatarRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRailTileFooter: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    gap: spacing.xs,
  },
  avatarRailTileLabel: {
    color: '#FFFFFF',
  },
  avatarTileProgressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.24)',
    overflow: 'hidden',
  },
  avatarTileProgressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
  },
  avatarAddTile: {
    borderRadius: 22,
    backgroundColor: '#FFD900',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.xxs,
  },
  avatarAddTileDisabled: {
    opacity: 0.55,
  },
  avatarQuickActionPrimary: {
    flex: 1,
    minHeight: 104,
  },
  avatarQuickActionSecondary: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
    ...welcomeCardShadow,
  },
  avatarAddTileIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAddTileTitle: {
    color: '#111521',
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  uploadText: {
    color: '#616777',
  },
  uploadRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  avatarFooterHint: {
    color: '#71717A',
    textAlign: 'center',
    marginTop: -2,
  },
  avatarEditorModal: {
    flex: 1,
    backgroundColor: '#050608',
    paddingTop: spacing.xl,
  },
  avatarEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  avatarEditorHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditorHeaderTitle: {
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  avatarEditorDoneButton: {
    minHeight: 40,
    borderRadius: radius.full,
    backgroundColor: '#FFD900',
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  avatarEditorDoneButtonDisabled: {
    opacity: 0.5,
  },
  avatarEditorDoneButtonText: {
    color: '#0E111A',
  },
  avatarEditorCropStage: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  avatarEditorCropFrame: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    aspectRatio: 148 / 196,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#0F1218',
    borderWidth: 2,
    borderColor: '#FFD900',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEditorCropImage: {
    position: 'absolute',
  },
  avatarEditorCropPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  avatarEditorPlaceholderText: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  avatarEditorCropShadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarEditorCropShadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarEditorCropShadeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarEditorCropShadeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarEditorPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  avatarEditorPreviewCard: {
    width: 74,
    aspectRatio: 148 / 196,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111521',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditorPreviewCardImage: {
    position: 'absolute',
  },
  avatarEditorPreviewCircle: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#111521',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditorPreviewCircleImage: {
    position: 'absolute',
  },
  avatarEditorZoomBlock: {
    gap: spacing.xs,
  },
  avatarEditorZoomLabel: {
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
  },
  avatarEditorLibrarySection: {
    flex: 1,
    marginTop: spacing.md,
    backgroundColor: '#0B0D12',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  avatarEditorLibraryTitle: {
    color: '#FFFFFF',
    marginBottom: spacing.sm,
  },
  avatarEditorLibraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  avatarEditorLibraryTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#161A22',
    position: 'relative',
  },
  avatarEditorLibraryTileSelected: {
    borderWidth: 3,
    borderColor: '#FFD900',
  },
  avatarEditorLibraryTileImage: {
    width: '100%',
    height: '100%',
  },
  avatarEditorLibraryTileShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,8,12,0.08)',
  },
  avatarEditorLibrarySelectedBadge: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: '#FFD900',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarProfilePreviewModal: {
    flex: 1,
    backgroundColor: 'rgba(4,5,8,0.88)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
  },
  avatarProfilePreviewTopBar: {
    width: '100%',
    maxWidth: 420,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  avatarProfilePreviewDownButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarProfilePreviewCard: {
    width: '100%',
    maxWidth: 420,
    flex: 1,
    aspectRatio: 148 / 196,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#161A22',
    position: 'relative',
  },
  avatarProfilePreviewImage: {
    width: '100%',
    height: '100%',
  },
  avatarProfilePreviewFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#161A22',
  },
  avatarProfilePreviewImageShade: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarDragOverlay: {
    position: 'absolute',
    top: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#18181B',
    zIndex: 10,
    ...welcomeCardShadow,
  },
  textLinkButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  textLinkButtonLabel: {
    color: '#10B981',
  },
  verificationStepScreen: {
    gap: spacing.md,
  },
  verificationStepTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  verificationFrame: {
    borderRadius: 28,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
    minHeight: 292,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  verificationFrameCompact: {
    minHeight: 244,
  },
  verificationImage: {
    width: '100%',
    height: '100%',
  },
  verificationCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  verificationPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  verificationOval: {
    width: 200,
    height: 272,
    borderRadius: 120,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: 'transparent',
    position: 'absolute',
  },
  verificationOvalCompact: {
    width: 178,
    height: 236,
  },
  verificationCameraHintText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  verificationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 24,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  verificationWarningText: {
    color: '#A1A1AA',
    flex: 1,
    lineHeight: 20,
  },
  notificationsStack: {
    gap: spacing.md,
  },
  notificationBenefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 24,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    padding: spacing.lg,
  },
  notificationIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIconWrapRed: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  notificationIconWrapGreen: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  notificationBenefitTextWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  notificationBenefitTitle: {
    color: '#FFFFFF',
  },
  notificationBenefitBody: {
    color: '#A1A1AA',
  },
  notificationsFooter: {
    gap: spacing.md,
    marginTop: 'auto',
  },
  notificationsSkipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  notificationsSkipText: {
    color: '#71717A',
  },
  finishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  finishAvatar: {
    width: 74,
    height: 74,
    borderRadius: radius.full,
    backgroundColor: '#EFF0F5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  finishAvatarImage: {
    width: '100%',
    height: '100%',
  },
  finishHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  finishName: {
    color: '#131722',
  },
  finishUsername: {
    color: '#616777',
  },
  finishStatRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  finishStat: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#E5E8F0',
    padding: spacing.md,
    gap: spacing.xs,
  },
  finishStatLabel: {
    color: '#7B8192',
    letterSpacing: 1.1,
  },
  finishStatValue: {
    color: '#121621',
  },
  finishNotice: {
    marginTop: spacing.lg,
    borderRadius: 20,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
  },
  finishNoticeText: {
    color: '#A1A1AA',
    flex: 1,
  },
  errorBanner: {
    marginTop: spacing.lg,
    borderRadius: 20,
    backgroundColor: 'rgba(127,29,29,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
  },
  errorBannerText: {
    color: '#FCA5A5',
    flex: 1,
  },
  footer: {
    marginTop: spacing.xl,
  },
  footerCompact: {
    marginTop: spacing.lg,
  },
  pillButton: {
    minHeight: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
  },
  pillButtonPrimary: {
    backgroundColor: '#10B981',
  },
  pillButtonSecondary: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  pillButtonPressed: {
    opacity: 0.94,
  },
  pillButtonDisabled: {
    opacity: 0.55,
  },
  pillButtonIcon: {
    marginRight: spacing.sm,
  },
  pillButtonTextPrimary: {
    color: '#000000',
    textAlign: 'center',
  },
  pillButtonTextSecondary: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  bgBlobLeft: {
    position: 'absolute',
    left: -90,
    top: 120,
    width: 180,
    height: 180,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  bgBlobCenter: {
    position: 'absolute',
    top: 240,
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16,185,129,0.04)',
  },
  bgBlobRight: {
    position: 'absolute',
    right: -64,
    bottom: 140,
    width: 180,
    height: 220,
    borderRadius: 90,
    backgroundColor: 'rgba(52,211,153,0.05)',
  },
  bgRibbonTop: {
    position: 'absolute',
    right: 36,
    top: -12,
    width: 72,
    height: 180,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bgRibbonBottom: {
    position: 'absolute',
    right: 26,
    top: 38,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bgDots: {
    position: 'absolute',
    top: 140,
    right: 104,
    width: 88,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(16,185,129,0.04)',
  },
  welcomeGlowLeft: {
    position: 'absolute',
    left: -80,
    top: 180,
    width: 220,
    height: 220,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16,185,129,0.16)',
  },
  welcomeGlowRight: {
    position: 'absolute',
    right: -36,
    top: 104,
    width: 200,
    height: 200,
    borderRadius: radius.full,
    backgroundColor: 'rgba(52,211,153,0.1)',
  },
  welcomeSparkA: {
    position: 'absolute',
    top: 54,
    left: 18,
    width: 34,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: '#10B981',
    transform: [{ rotate: '-18deg' }],
  },
  welcomeSparkB: {
    position: 'absolute',
    top: 108,
    right: 42,
    width: 48,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: '#10B981',
    transform: [{ rotate: '18deg' }],
  },
  welcomeSparkC: {
    position: 'absolute',
    top: 106,
    right: 82,
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: '#00D36B',
  },
  welcomeDotA: {
    position: 'absolute',
    top: 150,
    left: 44,
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(52,211,153,0.82)',
  },
  welcomeDotB: {
    position: 'absolute',
    top: 282,
    left: 20,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  welcomeDotC: {
    position: 'absolute',
    bottom: 180,
    right: 86,
    width: 9,
    height: 9,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  welcomeDotD: {
    position: 'absolute',
    bottom: 90,
    left: 80,
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
});
