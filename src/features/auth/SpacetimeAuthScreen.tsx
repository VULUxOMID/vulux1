import { useSignIn, useSignUp, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  applyQaGuestAuthSession,
  isSupabaseAuthSpikeActive,
  readSupabaseAuthSpikeConfigError,
  requestSupabasePasswordReset,
  resendSupabaseConfirmation,
  signInSupabaseSpike,
  signUpSupabaseSpike,
  useAuth as useSessionAuth,
} from '../../auth/spacetimeSession';
import {
  clearPendingQaClerkTicket,
  decodeClerkFrontendHostFromPublishableKey,
  getQaAuthHelperUrl,
  isQaGuestAuthEnabled,
  isQaPasswordlessLoginEnabled,
  readPendingQaClerkTicket,
  redirectToQaClerkOverride,
  requestQaGuestSession,
  requestQaClerkSignInTicket,
  writePendingQaClerkTicket,
} from '../../config/qaAuth';
import { readConfiguredClerkPublishableKey } from '../../config/clerk';
import {
  AppButton,
  AppScreen,
  AppText,
  AppTextInput,
} from '../../components';
import { colors, radius, spacing } from '../../theme';

type SpacetimeAuthScreenProps = {
  mode: 'welcome' | 'login' | 'register' | 'verify' | 'forgot-password';
};

type ClerkError = {
  errors?: Array<{ message?: string; longMessage?: string }>;
};

type ResetPasswordEmailFactor = {
  strategy: 'reset_password_email_code';
  emailAddressId: string;
  safeIdentifier?: string;
};

type SupportedSignInFactor = {
  strategy?: unknown;
  emailAddressId?: unknown;
  phoneNumberId?: unknown;
  safeIdentifier?: unknown;
};

type PendingSignInSecondFactor = {
  strategy: 'email_code' | 'phone_code';
  emailAddressId?: string;
  phoneNumberId?: string;
  safeIdentifier?: string;
};

const AUTH_ACCENTS: Record<SpacetimeAuthScreenProps['mode'], readonly [string, string, string]> = {
  welcome: ['#09090B', '#111113', '#171723'],
  login: ['#09090B', '#131318', '#1C1226'],
  register: ['#09090B', '#121116', '#1B141F'],
  verify: ['#09090B', '#131318', '#181226'],
  'forgot-password': ['#09090B', '#121116', '#1A151A'],
};

const AUTH_DECOR = [
  { top: 66, left: 26, width: 62, height: 16, rotate: '-14deg', color: colors.accentDanger },
  { top: 108, right: 34, width: 20, height: 20, rotate: '0deg', color: colors.accentPrimary },
  { top: 152, left: 64, width: 18, height: 18, rotate: '0deg', color: colors.accentPremium },
  { top: 186, right: 58, width: 72, height: 18, rotate: '21deg', color: colors.accentWarning },
  { top: 236, left: 24, width: 28, height: 28, rotate: '0deg', color: '#3D68FF' },
  { top: 248, right: 32, width: 22, height: 22, rotate: '0deg', color: colors.accentCash },
  { top: 290, left: 96, width: 54, height: 14, rotate: '-24deg', color: colors.accentPremium },
  { top: 318, right: 104, width: 16, height: 16, rotate: '0deg', color: colors.accentPrimary },
] as const;

function readHeroTitle(mode: SpacetimeAuthScreenProps['mode']) {
  switch (mode) {
    case 'login':
      return 'Jump back into the room.';
    case 'register':
      return 'Tell us a bit about you.';
    case 'verify':
      return 'Verify your email.';
    case 'forgot-password':
      return 'Reset your password.';
    default:
      return 'Go live. Talk fast. Build signal.';
  }
}

function readHeroBody(mode: SpacetimeAuthScreenProps['mode']) {
  switch (mode) {
    case 'login':
      return 'Sign in and return to live rooms, chat, music, and your profile status without friction.';
    case 'register':
      return 'Create the account, verify once, and VULU will restore your runtime identity before the app opens up.';
    case 'verify':
      return 'One code and the rest of the experience unlocks.';
    case 'forgot-password':
      return 'We send the reset code, you choose the new password, and the account comes back cleanly.';
    default:
      return 'Social gravity for live, music, profile, and chat.';
  }
}

type AuthShellProps = {
  children: ReactNode;
  mode: SpacetimeAuthScreenProps['mode'];
  title: string;
  subtitle: string;
  errorMessage?: string | null;
  infoMessage?: string | null;
  statusHint?: string | null;
};

function AuthShell({
  children,
  mode,
  title,
  subtitle,
  errorMessage,
  infoMessage,
  statusHint,
}: AuthShellProps) {
  const accent = AUTH_ACCENTS[mode];
  const isWelcome = mode === 'welcome';
  const heroTitle = readHeroTitle(mode);
  const heroBody = readHeroBody(mode);

  return (
    <AppScreen noPadding style={styles.container}>
      <LinearGradient
        colors={[accent[0], accent[1], colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.blobPrimary} />
      <View style={styles.blobSecondary} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stage}>
          <View style={styles.heroPanel}>
            {AUTH_DECOR.map((shape, index) => (
              <View
                key={`shape-${index}`}
                style={[
                  styles.decorShape,
                  {
                    top: shape.top,
                    left: 'left' in shape ? shape.left : undefined,
                    right: 'right' in shape ? shape.right : undefined,
                    width: shape.width,
                    height: shape.height,
                    backgroundColor: shape.color,
                    transform: [{ rotate: shape.rotate }],
                  },
                ]}
              />
            ))}

            <View style={styles.logoLockup}>
              <View style={styles.logoBadge}>
                <AppText style={styles.logoText}>VULU</AppText>
              </View>
              <AppText variant="smallBold" style={styles.logoSubline}>
                {isWelcome ? heroTitle : 'Go live. Get real. Build signal.'}
              </AppText>
            </View>

            {isWelcome ? (
              <View style={styles.heroCopy}>
                <AppText variant="small" style={styles.heroBody}>
                  {heroBody}
                </AppText>
              </View>
            ) : (
              <View style={styles.compactTopBar}>
                <Ionicons name="sparkles" size={16} color={colors.accentPremium} />
                <AppText variant="micro" style={styles.compactTopBarText}>
                  VULU onboarding
                </AppText>
              </View>
            )}
          </View>

          <View style={[styles.cardShell, !isWelcome && styles.cardShellSheet]}>
            <View style={styles.cardHandle} />
            <View style={styles.cardHeader}>
              {!isWelcome ? (
                <>
                  <AppText variant="h2" style={styles.title}>
                    {heroTitle}
                  </AppText>
                  <AppText variant="small" style={styles.subtitle}>
                    {heroBody}
                  </AppText>
                </>
              ) : (
                <>
                  <AppText variant="h2" style={styles.title}>
                    {title}
                  </AppText>
                  <AppText variant="small" style={styles.subtitle}>
                    {subtitle}
                  </AppText>
                </>
              )}
            </View>

            {children}

            {errorMessage ? (
              <View style={[styles.notice, styles.errorNotice]}>
                <Ionicons name="alert-circle" size={16} color={colors.accentDanger} />
                <AppText variant="small" style={styles.errorText}>
                  {errorMessage}
                </AppText>
              </View>
            ) : null}

            {infoMessage ? (
              <View style={[styles.notice, styles.infoNotice]}>
                <Ionicons name="information-circle" size={16} color={colors.accentPrimary} />
                <AppText variant="small" style={styles.infoText}>
                  {infoMessage}
                </AppText>
              </View>
            ) : null}

            {statusHint ? (
              <View style={styles.notice}>
                <Ionicons name="radio-outline" size={16} color={colors.textSecondary} />
                <AppText variant="small" style={styles.hintText}>
                  {statusHint}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function readClerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const firstError = (error as ClerkError).errors?.[0];
    const message =
      firstError?.longMessage?.trim() ||
      firstError?.message?.trim() ||
      ('message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.trim()
        : '');

    if (message) {
      return message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
}

function readFriendlyIdentifierError(error: unknown): string | null {
  const message = readClerkErrorMessage(error, '');
  if (message.toLowerCase() !== 'identifier is invalid.') {
    return null;
  }

  return 'That identifier is not enabled for sign-in in Clerk. Try your username, or enable Sign in with email in the Clerk Dashboard.';
}

function readResetPasswordEmailFactor(resource: {
  supportedFirstFactors?: unknown;
} | null | undefined): ResetPasswordEmailFactor | null {
  const factors = Array.isArray(resource?.supportedFirstFactors)
    ? resource.supportedFirstFactors
    : [];

  for (const factor of factors) {
    if (
      factor &&
      typeof factor === 'object' &&
      (factor as { strategy?: unknown }).strategy === 'reset_password_email_code' &&
      typeof (factor as { emailAddressId?: unknown }).emailAddressId === 'string'
    ) {
      return {
        strategy: 'reset_password_email_code',
        emailAddressId: (factor as { emailAddressId: string }).emailAddressId,
        safeIdentifier:
          typeof (factor as { safeIdentifier?: unknown }).safeIdentifier === 'string'
            ? (factor as { safeIdentifier: string }).safeIdentifier
            : undefined,
      };
    }
  }

  return null;
}

function readSignInFactorList(
  resource: {
    supportedFirstFactors?: unknown;
    supportedSecondFactors?: unknown;
    supported_first_factors?: unknown;
    supported_second_factors?: unknown;
  } | null | undefined,
  kind: 'first' | 'second',
): SupportedSignInFactor[] {
  const raw =
    kind === 'first'
      ? resource?.supportedFirstFactors ?? resource?.supported_first_factors
      : resource?.supportedSecondFactors ?? resource?.supported_second_factors;
  return Array.isArray(raw) ? (raw as SupportedSignInFactor[]) : [];
}

function hasSignInFactorStrategy(
  resource: {
    supportedFirstFactors?: unknown;
    supportedSecondFactors?: unknown;
    supported_first_factors?: unknown;
    supported_second_factors?: unknown;
  } | null | undefined,
  kind: 'first' | 'second',
  strategy: string,
): boolean {
  return readSignInFactorList(resource, kind).some(
    (factor) =>
      factor &&
      typeof factor === 'object' &&
      typeof factor.strategy === 'string' &&
      factor.strategy === strategy,
  );
}

function readPendingSignInSecondFactor(
  resource: {
    supportedSecondFactors?: unknown;
    supported_second_factors?: unknown;
  } | null | undefined,
): PendingSignInSecondFactor | null {
  const factors = readSignInFactorList(resource, 'second');

  for (const factor of factors) {
    if (!factor || typeof factor !== 'object' || typeof factor.strategy !== 'string') {
      continue;
    }

    if (factor.strategy === 'email_code') {
      return {
        strategy: 'email_code',
        emailAddressId:
          typeof factor.emailAddressId === 'string' ? factor.emailAddressId : undefined,
        safeIdentifier:
          typeof factor.safeIdentifier === 'string' ? factor.safeIdentifier : undefined,
      };
    }

    if (factor.strategy === 'phone_code') {
      return {
        strategy: 'phone_code',
        phoneNumberId:
          typeof factor.phoneNumberId === 'string' ? factor.phoneNumberId : undefined,
        safeIdentifier:
          typeof factor.safeIdentifier === 'string' ? factor.safeIdentifier : undefined,
      };
    }
  }

  return null;
}

function QaGuestOnlyAuthScreen({ mode }: SpacetimeAuthScreenProps) {
  const router = useRouter();
  const { isLoaded } = useSessionAuth();
  const [identifier, setIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const navigateToHome = useCallback(() => {
    router.replace('/');
  }, [router]);

  const handleGuestContinue = useCallback(async () => {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setErrorMessage('Enter a username or nickname.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const guestSession = await requestQaGuestSession(normalizedIdentifier);
      await applyQaGuestAuthSession(guestSession);
      navigateToHome();
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Unable to start the QA guest session.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [identifier, navigateToHome]);

  const title =
    mode === 'register'
      ? 'Create a QA guest account'
      : mode === 'welcome'
        ? 'QA guest mode'
        : 'Sign in for QA';
  const subtitle =
    'Local QA guest auth is enabled. Enter any username on each device and Vulu will create a temporary guest session with no email verification or password.';

  return (
    <AuthShell
      mode={mode}
      title={title}
      subtitle={subtitle}
      errorMessage={errorMessage}
      infoMessage={infoMessage}
    >
      <View style={styles.form}>
        <AppTextInput
          autoCapitalize="none"
          autoComplete="username"
          onChangeText={setIdentifier}
          placeholder="Username or nickname"
          style={styles.input}
          value={identifier}
        />
        <AppButton
          title="Continue"
          onPress={() => {
            void handleGuestContinue();
          }}
          loading={isSubmitting}
          disabled={!isLoaded || isSubmitting}
          icon="log-in-outline"
        />
        {mode !== 'welcome' ? (
          <AppButton
            title="Back"
            onPress={() => router.replace('/(auth)')}
            variant="outline"
            disabled={isSubmitting}
          />
        ) : null}
      </View>
    </AuthShell>
  );
}

function SupabaseSpikeAuthScreen({ mode }: SpacetimeAuthScreenProps) {
  const router = useRouter();
  const {
    hasSession,
    isLoaded,
    isSignedIn,
    needsVerification,
    status,
    syncError,
  } = useSessionAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'sign_in' | 'create_account'>(
    mode === 'register' ? 'create_account' : 'sign_in',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const configError = readSupabaseAuthSpikeConfigError();

  const isCreateAccountMode = authMode === 'create_account';

  useEffect(() => {
    if (isSignedIn) {
      router.replace('/');
    }
  }, [isSignedIn, router]);

  const handleSignIn = useCallback(async () => {
    if (configError) {
      setErrorMessage(configError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await signInSupabaseSpike(email, password);
      setPassword('');
      setInfoMessage('Supabase session created. Vulu is connecting to SpaceTimeDB.');
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Unable to sign in to Supabase right now.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [configError, email, password]);

  const handleCreateAccount = useCallback(async () => {
    if (configError) {
      setErrorMessage(configError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await signUpSupabaseSpike(email, password);
      setPassword('');
      setAuthMode('sign_in');
      setInfoMessage('Check your email to confirm your account, then return here to sign in.');
    } catch (error) {
      const message = readClerkErrorMessage(error, 'Unable to create your account right now.');
      const normalized = message.toLowerCase();
      if (
        normalized.includes('429') ||
        normalized.includes('too many requests') ||
        normalized.includes('rate limit')
      ) {
        setErrorMessage('Too many signup attempts. Wait a minute, then try again.');
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [configError, email, password]);

  const handleForgotPassword = useCallback(async () => {
    if (configError) {
      setErrorMessage(configError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await requestSupabasePasswordReset(email);
      setInfoMessage('If that email exists, a password reset link has been sent.');
    } catch (error) {
      const message = readClerkErrorMessage(error, 'Unable to send a password reset email right now.');
      const normalized = message.toLowerCase();
      if (
        normalized.includes('429') ||
        normalized.includes('too many requests') ||
        normalized.includes('rate limit')
      ) {
        setErrorMessage('Too many reset requests. Wait a minute, then try again.');
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [configError, email]);

  const handleResendConfirmation = useCallback(async () => {
    if (configError) {
      setErrorMessage(configError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await resendSupabaseConfirmation(email);
      setInfoMessage('Confirmation email sent. Check your inbox and spam folder.');
    } catch (error) {
      const message = readClerkErrorMessage(
        error,
        'Unable to resend the confirmation email right now.',
      );
      const normalized = message.toLowerCase();
      if (
        normalized.includes('429') ||
        normalized.includes('too many requests') ||
        normalized.includes('rate limit')
      ) {
        setErrorMessage('Too many confirmation email attempts. Wait a minute, then try again.');
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [configError, email]);

  const title =
    isCreateAccountMode
      ? 'Create your account'
      : mode === 'welcome'
        ? 'Supabase auth'
        : mode === 'login'
          ? 'Sign in with Supabase'
          : 'Supabase auth';
  const subtitle =
    'Supabase is now the default auth path. Clerk remains available as an explicit compatibility mode during migration.';
  const statusHint = configError
    ? configError
    : syncError
      ? syncError
      : hasSession && !isSignedIn && status === 'syncing'
        ? 'Supabase session is active. Vulu is reconnecting to SpaceTimeDB.'
        : hasSession && needsVerification
          ? 'Supabase session is active, but the account is still awaiting verification.'
          : null;

  return (
    <AuthShell
      mode={mode}
      title={title}
      subtitle={subtitle}
      errorMessage={errorMessage}
      infoMessage={infoMessage}
      statusHint={statusHint}
    >
      {mode === 'welcome' ? (
        <View style={styles.buttonGroup}>
          <AppButton
            title="Create account"
            onPress={() => router.replace('/(auth)/register')}
            disabled={!isLoaded}
            icon="person-add-outline"
          />
          <AppButton
            title="Log in"
            onPress={() => router.replace('/(auth)/login')}
            variant="outline"
            disabled={!isLoaded}
            icon="log-in-outline"
          />
        </View>
      ) : (
        <>
          <View style={styles.modeSwitch}>
            <AppButton
              title="Sign in"
              onPress={() => {
                setAuthMode('sign_in');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              variant={isCreateAccountMode ? 'outline' : 'primary'}
              disabled={isSubmitting}
            />
            <AppButton
              title="Create account"
              onPress={() => {
                setAuthMode('create_account');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              variant={isCreateAccountMode ? 'primary' : 'outline'}
              disabled={isSubmitting}
            />
          </View>

          <View style={styles.form}>
            <AppTextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Supabase email"
              style={styles.input}
              value={email}
            />
            <AppTextInput
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              placeholder="Supabase password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <AppButton
              title={isCreateAccountMode ? 'Create account' : 'Sign in'}
              onPress={() => {
                void (isCreateAccountMode ? handleCreateAccount() : handleSignIn());
              }}
              loading={isSubmitting}
              disabled={!isLoaded || isSubmitting || Boolean(configError)}
              icon={isCreateAccountMode ? 'person-add-outline' : 'log-in-outline'}
            />
            <AppButton
              title="Back"
              onPress={() => router.replace('/(auth)')}
              variant="outline"
              disabled={isSubmitting}
            />
          </View>

          <View style={styles.inlineActions}>
            {!isCreateAccountMode ? (
              <AppButton
                title="Forgot password"
                onPress={() => {
                  void handleForgotPassword();
                }}
                variant="outline"
                size="small"
                disabled={!isLoaded || isSubmitting || Boolean(configError)}
              />
            ) : null}
            <AppButton
              title="Resend confirmation"
              onPress={() => {
                void handleResendConfirmation();
              }}
              variant="outline"
              size="small"
              disabled={!isLoaded || isSubmitting || Boolean(configError)}
            />
          </View>
        </>
      )}
    </AuthShell>
  );
}

export function SpacetimeAuthScreen({ mode }: SpacetimeAuthScreenProps) {
  if (isQaGuestAuthEnabled()) {
    return <QaGuestOnlyAuthScreen mode={mode} />;
  }

  if (isSupabaseAuthSpikeActive()) {
    return <SupabaseSpikeAuthScreen mode={mode} />;
  }

  const router = useRouter();
  const { isLoaded: isSignInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const { user } = useUser();
  const {
    hasSession,
    isLoaded: isSessionLoaded,
    isSignedIn,
    needsVerification,
    status,
    syncError,
  } = useSessionAuth();
  const [loginEmail, setLoginEmail] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [signInVerificationCode, setSignInVerificationCode] = useState('');
  const [pendingSignInSecondFactor, setPendingSignInSecondFactor] =
    useState<PendingSignInSecondFactor | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const qaAuthHelperUrl = getQaAuthHelperUrl();
  const qaPasswordlessLoginEnabled = isQaPasswordlessLoginEnabled() && Boolean(qaAuthHelperUrl);
  const configuredClerkPublishableKey = readConfiguredClerkPublishableKey();
  const qaFrontendHost = decodeClerkFrontendHostFromPublishableKey(
    configuredClerkPublishableKey,
  );
  const pendingQaTicketAttemptRef = useRef<string | null>(null);

  const canUseSignIn = isSignInLoaded && Boolean(signIn) && Boolean(setActiveSignIn);
  const canUseSignUp = isSignUpLoaded && Boolean(signUp) && Boolean(setActiveSignUp);

  const navigateToHome = useCallback(() => {
    router.replace('/');
  }, [router]);

  const clearPendingSignInSecondFactor = useCallback(() => {
    setPendingSignInSecondFactor(null);
    setSignInVerificationCode('');
  }, []);

  const completeSignInIfPossible = useCallback(
    async (attempt: { status: string | null; createdSessionId: string | null | undefined }) => {
      if (
        attempt.status === 'complete' &&
        attempt.createdSessionId &&
        canUseSignIn &&
        setActiveSignIn
      ) {
        clearPendingSignInSecondFactor();
        await setActiveSignIn({ session: attempt.createdSessionId });
        navigateToHome();
        return true;
      }
      return false;
    },
    [canUseSignIn, clearPendingSignInSecondFactor, navigateToHome, setActiveSignIn],
  );

  const beginSignInSecondFactorChallenge = useCallback(
    async (
      attempt: {
        status: string | null;
        supportedSecondFactors?: unknown;
        supported_second_factors?: unknown;
      } | null,
    ) => {
      if (!signIn) {
        return false;
      }

      if (attempt?.status !== 'needs_second_factor') {
        return false;
      }

      const nextFactor = readPendingSignInSecondFactor(attempt);
      if (!nextFactor) {
        return false;
      }

      if (nextFactor.strategy === 'email_code') {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          ...(nextFactor.emailAddressId ? { emailAddressId: nextFactor.emailAddressId } : {}),
        });
      } else if (nextFactor.strategy === 'phone_code') {
        await signIn.prepareSecondFactor({
          strategy: 'phone_code',
          ...(nextFactor.phoneNumberId ? { phoneNumberId: nextFactor.phoneNumberId } : {}),
        });
      } else {
        return false;
      }

      setPendingSignInSecondFactor(nextFactor);
      setSignInVerificationCode('');
      setInfoMessage(
        `We sent a sign-in verification code to ${
          nextFactor.safeIdentifier ?? 'your verification channel'
        }.`,
      );
      return true;
    },
    [signIn],
  );

  const handleSignIn = useCallback(async () => {
    if (!canUseSignIn || !signIn || !setActiveSignIn) {
      setErrorMessage('Clerk is still loading. Please try again in a moment.');
      return;
    }

    const identifier = normalizeIdentifier(loginEmail);
    const qaTicket = process.env.EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET?.trim() || null;
    if (!qaTicket && !identifier) {
      setErrorMessage('Enter your email or username.');
      return;
    }
    if (!qaTicket && !qaPasswordlessLoginEnabled && !password) {
      setErrorMessage('Enter both your email and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      clearPendingSignInSecondFactor();

      const completeTicketSignIn = async (ticket: string, sourceLabel: string) => {
        const ticketAttempt = await signIn.create({
          strategy: 'ticket',
          ticket,
        });

        if (await completeSignInIfPossible(ticketAttempt)) {
          clearPendingQaClerkTicket();
          return true;
        }

        const startedTicketSecondFactor = await beginSignInSecondFactorChallenge(ticketAttempt);
        if (startedTicketSecondFactor) {
          clearPendingQaClerkTicket();
          return true;
        }

        setInfoMessage(`${sourceLabel} sign-in needs another step. Complete it and retry.`);
        return true;
      };

      const pendingQaTicket = readPendingQaClerkTicket();

      if (qaTicket && !password) {
        await completeTicketSignIn(qaTicket, 'Clerk ticket');
        return;
      }

      if (
        pendingQaTicket?.ticket &&
        pendingQaTicket.publishableKey === configuredClerkPublishableKey &&
        !password
      ) {
        await completeTicketSignIn(pendingQaTicket.ticket, 'Pending QA Clerk ticket');
        return;
      }

      if (qaPasswordlessLoginEnabled && identifier) {
        try {
          const qaTicketResponse = await requestQaClerkSignInTicket(identifier);
          if (
            qaTicketResponse.publishableKey &&
            qaTicketResponse.publishableKey !== configuredClerkPublishableKey
          ) {
            writePendingQaClerkTicket({
              ticket: qaTicketResponse.ticket,
              publishableKey: qaTicketResponse.publishableKey,
            });
            redirectToQaClerkOverride(qaTicketResponse.publishableKey);
          }
          await completeTicketSignIn(qaTicketResponse.ticket, 'Local QA auth helper');
          return;
        } catch (error) {
          if (!password) {
            throw error;
          }
        }
      }

      let attempt = await signIn.create({
        strategy: 'password',
        identifier,
        password,
      });

      if (await completeSignInIfPossible(attempt)) {
        return;
      }

      if (
        attempt.status === 'needs_first_factor' &&
        hasSignInFactorStrategy(attempt, 'first', 'password')
      ) {
        attempt = await signIn.attemptFirstFactor({
          strategy: 'password',
          password,
        });

        if (await completeSignInIfPossible(attempt)) {
          return;
        }
      }

      if (
        attempt.status === 'needs_identifier' &&
        hasSignInFactorStrategy(attempt, 'first', 'ticket')
      ) {
        if (qaTicket) {
          const handledQaTicket = await completeTicketSignIn(qaTicket, 'Clerk ticket');
          if (handledQaTicket) {
            return;
          }
        }

        if (qaPasswordlessLoginEnabled && identifier) {
          const qaTicketResponse = await requestQaClerkSignInTicket(identifier);
          if (
            qaTicketResponse.publishableKey &&
            qaTicketResponse.publishableKey !== configuredClerkPublishableKey
          ) {
            writePendingQaClerkTicket({
              ticket: qaTicketResponse.ticket,
              publishableKey: qaTicketResponse.publishableKey,
            });
            redirectToQaClerkOverride(qaTicketResponse.publishableKey);
          }
          const handledQaTicket = await completeTicketSignIn(
            qaTicketResponse.ticket,
            'Local QA auth helper',
          );
          if (handledQaTicket) {
            return;
          }
        }
      }

      const startedSecondFactor = await beginSignInSecondFactorChallenge(attempt);
      if (startedSecondFactor) {
        return;
      }

      if (attempt.status === 'needs_identifier') {
        setInfoMessage(qaPasswordlessLoginEnabled
          ? 'Local QA auth is enabled, but the helper could not complete this Clerk sign-in.'
          : 'Clerk requires a pending sign-in step. For QA smoke, set EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET and retry.');
        return;
      }

      setInfoMessage('Your sign-in needs another step in Clerk. Complete it and try again.');
    } catch (error) {
      setErrorMessage(
        readFriendlyIdentifierError(error) ??
          readClerkErrorMessage(error, 'Unable to sign in right now.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canUseSignIn,
    clearPendingSignInSecondFactor,
    completeSignInIfPossible,
    configuredClerkPublishableKey,
    beginSignInSecondFactorChallenge,
    loginEmail,
    password,
    qaPasswordlessLoginEnabled,
    signIn,
  ]);

  useEffect(() => {
    if (mode !== 'login' || !qaPasswordlessLoginEnabled || isSubmitting) {
      return;
    }

    const pendingQaTicket = readPendingQaClerkTicket();
    if (
      !pendingQaTicket?.ticket ||
      pendingQaTicket.publishableKey !== configuredClerkPublishableKey
    ) {
      return;
    }

    if (pendingQaTicketAttemptRef.current === pendingQaTicket.ticket) {
      return;
    }

    pendingQaTicketAttemptRef.current = pendingQaTicket.ticket;
    void handleSignIn();
  }, [
    configuredClerkPublishableKey,
    handleSignIn,
    isSubmitting,
    mode,
    qaPasswordlessLoginEnabled,
  ]);

  const handleResendSignInVerificationCode = useCallback(async () => {
    if (!canUseSignIn || !signIn || !pendingSignInSecondFactor) {
      setErrorMessage('Start sign-in again to request another verification code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (pendingSignInSecondFactor.strategy === 'email_code') {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          ...(pendingSignInSecondFactor.emailAddressId
            ? { emailAddressId: pendingSignInSecondFactor.emailAddressId }
            : {}),
        });
      } else {
        await signIn.prepareSecondFactor({
          strategy: 'phone_code',
          ...(pendingSignInSecondFactor.phoneNumberId
            ? { phoneNumberId: pendingSignInSecondFactor.phoneNumberId }
            : {}),
        });
      }

      setInfoMessage(
        `A new sign-in verification code was sent to ${
          pendingSignInSecondFactor.safeIdentifier ?? 'your verification channel'
        }.`,
      );
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Could not send a new sign-in code.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [canUseSignIn, pendingSignInSecondFactor, signIn]);

  const handleVerifySignInSecondFactor = useCallback(async () => {
    if (!canUseSignIn || !signIn || !pendingSignInSecondFactor) {
      setErrorMessage('Start sign-in again to complete verification.');
      return;
    }

    const code = signInVerificationCode.trim();
    if (!code) {
      setErrorMessage('Enter the sign-in verification code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const attempt = await signIn.attemptSecondFactor({
        strategy: pendingSignInSecondFactor.strategy,
        code,
      });

      if (await completeSignInIfPossible(attempt)) {
        return;
      }

      if (attempt.status === 'needs_second_factor') {
        setInfoMessage('The code was not accepted. Request a new code and try again.');
        return;
      }

      setInfoMessage('Your sign-in still needs another Clerk step.');
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'The sign-in code was not accepted.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canUseSignIn,
    completeSignInIfPossible,
    pendingSignInSecondFactor,
    signIn,
    signInVerificationCode,
  ]);

  const handleStartPasswordReset = useCallback(async () => {
    if (!canUseSignIn || !signIn) {
      setErrorMessage('Clerk is still loading. Please try again in a moment.');
      return;
    }

    const identifier = normalizeIdentifier(resetEmail);
    if (!identifier) {
      setErrorMessage('Enter your email to reset your password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const attempt = await signIn.create({
        strategy: 'reset_password_email_code',
        identifier,
      });

      const factor = readResetPasswordEmailFactor(attempt);
      if (!factor) {
        throw new Error('Password reset by email is not available for this account.');
      }

      await attempt.prepareFirstFactor({
        strategy: 'reset_password_email_code',
        emailAddressId: factor.emailAddressId,
      });

      setResetEmail(identifier);
      setResetStep('confirm');
      setInfoMessage(
        `We sent a password reset code to ${factor.safeIdentifier ?? identifier}.`,
      );
    } catch (error) {
      setErrorMessage(
        readFriendlyIdentifierError(error) ??
          readClerkErrorMessage(error, 'Unable to start password reset right now.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [canUseSignIn, resetEmail, signIn]);

  const handleResendResetCode = useCallback(async () => {
    if (!canUseSignIn || !signIn) {
      setErrorMessage('Clerk is still loading. Please try again in a moment.');
      return;
    }

    const factor = readResetPasswordEmailFactor(signIn);
    if (!factor) {
      setErrorMessage('Start the password reset flow again.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signIn.prepareFirstFactor({
        strategy: 'reset_password_email_code',
        emailAddressId: factor.emailAddressId,
      });
      setInfoMessage(
        `A fresh reset code was sent to ${factor.safeIdentifier ?? normalizeIdentifier(resetEmail)}.`,
      );
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Could not send a new reset code.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [canUseSignIn, resetEmail, signIn]);

  const handleResetPassword = useCallback(async () => {
    if (!canUseSignIn || !signIn) {
      setErrorMessage('Clerk is still loading. Please try again in a moment.');
      return;
    }

    const code = resetCode.trim();
    if (!code) {
      setErrorMessage('Enter the reset code from your email.');
      return;
    }
    if (!resetNewPassword) {
      setErrorMessage('Enter a new password.');
      return;
    }
    if (resetNewPassword.length < 8) {
      setErrorMessage('Use a password with at least 8 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMessage('Your new passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const verified = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      });

      const finalized =
        verified.status === 'needs_new_password'
          ? await verified.resetPassword({
            password: resetNewPassword,
            signOutOfOtherSessions: false,
          })
          : verified;

      if (finalized.status === 'complete' && finalized.createdSessionId && setActiveSignIn) {
        await setActiveSignIn({ session: finalized.createdSessionId });
        navigateToHome();
        return;
      }

      setInfoMessage('Your password was updated. Sign in with your new password.');
      router.replace('/(auth)/login');
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Unable to reset your password right now.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canUseSignIn,
    navigateToHome,
    resetCode,
    resetConfirmPassword,
    resetNewPassword,
    router,
    setActiveSignIn,
    signIn,
  ]);

  const handleSignUp = useCallback(async () => {
    if (!canUseSignUp || !signUp) {
      setErrorMessage('Clerk is still loading. Please try again in a moment.');
      return;
    }

    const emailAddress = normalizeEmail(registerEmail);
    if (!password) {
      setErrorMessage('Enter a password to create your account.');
      return;
    }
    if (!emailAddress) {
      setErrorMessage('Enter your email to create your account.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await signUp.create({
        emailAddress,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setInfoMessage(`We sent a verification code to ${emailAddress}.`);
      router.replace('/(auth)/verify-email');
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Unable to create your account right now.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canUseSignUp,
    confirmPassword,
    password,
    registerEmail,
    router,
    signUp,
  ]);

  const sendVerificationCode = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (canUseSignUp && signUp && signUp.emailAddress) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setInfoMessage(`A fresh verification code was sent to ${signUp.emailAddress}.`);
        return;
      }

      const primaryEmailAddress = user?.primaryEmailAddress;
      if (primaryEmailAddress && typeof primaryEmailAddress.prepareVerification === 'function') {
        await primaryEmailAddress.prepareVerification({ strategy: 'email_code' });
        setInfoMessage('A fresh verification code was sent to your primary email address.');
        return;
      }

      setErrorMessage('There is no pending email verification flow to resume.');
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'Could not send a new verification code.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [canUseSignUp, signUp, user]);

  const handleVerifyEmail = useCallback(async () => {
    const code = verificationCode.trim();
    if (!code) {
      setErrorMessage('Enter the verification code from your email.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (canUseSignUp && signUp && signUp.emailAddress) {
        const attempt = await signUp.attemptEmailAddressVerification({ code });
        if (attempt.status === 'complete' && attempt.createdSessionId && setActiveSignUp) {
          await setActiveSignUp({ session: attempt.createdSessionId });
          navigateToHome();
          return;
        }
      }

      const primaryEmailAddress = user?.primaryEmailAddress;
      if (primaryEmailAddress && typeof primaryEmailAddress.attemptVerification === 'function') {
        await primaryEmailAddress.attemptVerification({ code });

        if (typeof user?.reload === 'function') {
          await user.reload();
        }

        navigateToHome();
        return;
      }

      setErrorMessage('There is no email verification challenge to complete.');
    } catch (error) {
      setErrorMessage(readClerkErrorMessage(error, 'The verification code was not accepted.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canUseSignUp,
    navigateToHome,
    setActiveSignUp,
    signUp,
    user,
    verificationCode,
  ]);

  const title = useMemo(() => {
    if (mode === 'register') return 'Create your Vulu account';
    if (mode === 'login') return 'Sign in to Vulu';
    if (mode === 'verify') return 'Verify your email';
    if (mode === 'forgot-password') return 'Reset your password';
    return 'Welcome to Vulu';
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode === 'register') {
      return 'Use your email and password. Supabase authenticates the account, then Vulu restores the mapped runtime identity before connecting realtime services.';
    }
    if (mode === 'login') {
      return qaPasswordlessLoginEnabled
        ? `Local QA auth helper is enabled for ${qaFrontendHost ?? 'this Clerk instance'}. Enter any username and Vulu will create or reuse a temporary QA account with no password or email verification.`
        : 'Use your email or username and password. Vulu restores the same vulu_user_id after sign-in.';
    }
    if (mode === 'verify') {
      return 'Email verification is required before the app unlocks your SpacetimeDB-backed data.';
    }
    if (mode === 'forgot-password') {
      return 'Enter your email or username. We will email a reset code to the account email, then you can choose a new password.';
    }
    return 'Supabase authenticates the session. Cloudflare restores the canonical runtime identity, and Spacetime stays focused on realtime data.';
  }, [mode, qaFrontendHost, qaPasswordlessLoginEnabled]);

  const statusHint = useMemo(() => {
    if (mode !== 'verify' && syncError) {
      return syncError;
    }
    if (mode === 'verify' && hasSession && needsVerification) {
      return 'You are signed in, but the app stays locked until the primary email address is verified.';
    }
    if (mode !== 'verify' && hasSession && !isSignedIn && status === 'syncing') {
      return 'Your session is active. Vulu is restoring your runtime identity and reconnecting realtime services.';
    }
    return null;
  }, [hasSession, isSignedIn, mode, needsVerification, status, syncError]);

  return (
    <AuthShell
      mode={mode}
      title={title}
      subtitle={subtitle}
      errorMessage={errorMessage}
      infoMessage={infoMessage}
      statusHint={statusHint}
    >
      {mode === 'welcome' ? (
        <View style={styles.buttonGroup}>
          <AppButton
            title="Create account"
            onPress={() => router.replace('/(auth)/register')}
            disabled={!isSessionLoaded}
            icon="person-add-outline"
          />
          <AppButton
            title="Log in"
            onPress={() => router.replace('/(auth)/login')}
            variant="outline"
            disabled={!isSessionLoaded}
            icon="log-in-outline"
          />
        </View>
      ) : null}

      {mode === 'login' ? (
        <View style={styles.form}>
          <AppTextInput
            autoCapitalize="none"
            autoComplete="username"
            onChangeText={setLoginEmail}
            placeholder={qaPasswordlessLoginEnabled ? 'Username for QA' : 'Email or username'}
            style={styles.input}
            value={loginEmail}
          />
          {qaPasswordlessLoginEnabled ? null : (
            <AppTextInput
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          )}
          <AppButton
            title={qaPasswordlessLoginEnabled ? 'Continue' : 'Sign in'}
            onPress={() => {
              void handleSignIn();
            }}
            loading={isSubmitting}
            disabled={!canUseSignIn || isSubmitting}
            icon="log-in-outline"
          />
          {pendingSignInSecondFactor ? (
            <>
              <AppText secondary style={styles.resetPrompt}>
                Enter the sign-in verification code from{' '}
                {pendingSignInSecondFactor.safeIdentifier ?? 'your verification channel'}.
              </AppText>
              <AppTextInput
                autoCapitalize="characters"
                keyboardType="number-pad"
                onChangeText={setSignInVerificationCode}
                placeholder="Sign-in verification code"
                style={styles.input}
                value={signInVerificationCode}
              />
              <AppButton
                title="Verify sign-in code"
                onPress={() => {
                  void handleVerifySignInSecondFactor();
                }}
                loading={isSubmitting}
                disabled={!canUseSignIn || isSubmitting}
                icon="shield-checkmark-outline"
              />
              <AppButton
                title="Resend sign-in code"
                onPress={() => {
                  void handleResendSignInVerificationCode();
                }}
                variant="outline"
                disabled={!canUseSignIn || isSubmitting}
              />
            </>
          ) : null}
          <AppButton
            title="Need an account? Sign up"
            onPress={() => router.replace('/(auth)/register')}
            variant="outline"
            disabled={isSubmitting}
          />
          <AppButton
            title="Forgot password?"
            onPress={() => router.replace('/(auth)/forgot-password')}
            variant="outline"
            disabled={isSubmitting}
          />
        </View>
      ) : null}

      {mode === 'register' ? (
        <View style={styles.form}>
          <AppTextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setRegisterEmail}
            placeholder="Email"
            style={styles.input}
            value={registerEmail}
          />
          <AppTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <AppTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
          />
          <AppButton
            title="Create account"
            onPress={() => {
              void handleSignUp();
            }}
            loading={isSubmitting}
            disabled={!canUseSignUp || isSubmitting}
            icon="person-add-outline"
          />
          <AppButton
            title="Have an account? Sign in"
            onPress={() => router.replace('/(auth)/login')}
            variant="outline"
            disabled={isSubmitting}
          />
        </View>
      ) : null}

      {mode === 'verify' ? (
        <View style={styles.form}>
          <AppTextInput
            autoCapitalize="characters"
            keyboardType="number-pad"
            onChangeText={setVerificationCode}
            placeholder="Verification code"
            style={styles.input}
            value={verificationCode}
          />
          <AppButton
            title="Verify email"
            onPress={() => {
              void handleVerifyEmail();
            }}
            loading={isSubmitting}
            disabled={isSubmitting}
            icon="mail-open-outline"
          />
          <AppButton
            title="Resend code"
            onPress={() => {
              void sendVerificationCode();
            }}
            variant="outline"
            disabled={isSubmitting}
          />
          <AppButton
            title="Back to sign in"
            onPress={() => router.replace('/(auth)/login')}
            variant="outline"
            disabled={isSubmitting}
          />
        </View>
      ) : null}

      {mode === 'forgot-password' ? (
        <View style={styles.form}>
          {resetStep === 'request' ? (
            <>
              <AppTextInput
                autoCapitalize="none"
                autoComplete="username"
                onChangeText={setResetEmail}
                placeholder="Email or username"
                style={styles.input}
                value={resetEmail}
              />
              <AppButton
                title="Send reset code"
                onPress={() => {
                  void handleStartPasswordReset();
                }}
                loading={isSubmitting}
                disabled={!canUseSignIn || isSubmitting}
                icon="mail-outline"
              />
            </>
          ) : (
            <>
              <AppText secondary style={styles.resetPrompt}>
                Enter the reset code from your email, then choose a new password.
              </AppText>
              <AppTextInput
                autoCapitalize="characters"
                keyboardType="number-pad"
                onChangeText={setResetCode}
                placeholder="Reset code"
                style={styles.input}
                value={resetCode}
              />
              <AppTextInput
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setResetNewPassword}
                placeholder="New password"
                secureTextEntry
                style={styles.input}
                value={resetNewPassword}
              />
              <AppTextInput
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setResetConfirmPassword}
                placeholder="Confirm new password"
                secureTextEntry
                style={styles.input}
                value={resetConfirmPassword}
              />
              <AppButton
                title="Reset password"
                onPress={() => {
                  void handleResetPassword();
                }}
                loading={isSubmitting}
                disabled={!canUseSignIn || isSubmitting}
                icon="key-outline"
              />
              <AppButton
                title="Resend reset code"
                onPress={() => {
                  void handleResendResetCode();
                }}
                variant="outline"
                disabled={!canUseSignIn || isSubmitting}
              />
            </>
          )}
          <AppButton
            title="Back to sign in"
            onPress={() => router.replace('/(auth)/login')}
            variant="outline"
            disabled={isSubmitting}
          />
        </View>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#120814',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  blobPrimary: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    top: -120,
    right: -130,
    backgroundColor: 'rgba(190, 56, 243, 0.12)',
  },
  blobSecondary: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -80,
    left: -120,
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
  },
  stage: {
    flex: 1,
    minHeight: '100%',
    justifyContent: 'space-between',
  },
  heroPanel: {
    minHeight: 330,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: spacing.xl,
  },
  decorShape: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.9,
  },
  logoLockup: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoBadge: {
    minWidth: 230,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#111111',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logoText: {
    color: '#111111',
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  logoSubline: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  heroCopy: {
    marginTop: spacing.md,
    maxWidth: 300,
  },
  heroBody: {
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  compactTopBar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  compactTopBarText: {
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  cardShell: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(17, 17, 19, 0.94)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    borderWidth: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cardShellSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  cardHandle: {
    alignSelf: 'center',
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: -spacing.sm,
  },
  cardHeader: {
    gap: spacing.sm,
  },
  title: {
    color: '#FFFDFD',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 20,
    textAlign: 'center',
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  form: {
    gap: spacing.sm,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonGroup: {
    gap: spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  errorNotice: {
    backgroundColor: 'rgba(255, 68, 88, 0.10)',
    borderColor: 'rgba(255, 68, 88, 0.20)',
  },
  infoNotice: {
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderColor: 'rgba(0, 230, 118, 0.20)',
  },
  errorText: {
    color: colors.accentDanger,
    flex: 1,
  },
  infoText: {
    color: colors.accentPrimary,
    flex: 1,
  },
  resetPrompt: {
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 20,
  },
  hintText: {
    color: colors.textSecondary,
    flex: 1,
  },
});
