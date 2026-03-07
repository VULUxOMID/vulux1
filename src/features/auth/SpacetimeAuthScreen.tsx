import { useSignIn, useSignUp, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth as useSessionAuth } from '../../auth/spacetimeSession';
import {
  AppButton,
  AppScreen,
  AppText,
  AppTextInput,
} from '../../components';
import { colors, radius, spacing } from '../../theme';
import { buildSignUpProfileParts } from './signUpProfile';
import { savePendingSignUpIdentity } from './pendingSignUpIdentity';

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

export function SpacetimeAuthScreen({ mode }: SpacetimeAuthScreenProps) {
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
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
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

  const canUseSignIn = isSignInLoaded && Boolean(signIn) && Boolean(setActiveSignIn);
  const canUseSignUp = isSignUpLoaded && Boolean(signUp) && Boolean(setActiveSignUp);

  const navigateToHome = useCallback(() => {
    router.replace('/(tabs)');
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
    if (!qaTicket && (!identifier || !password)) {
      setErrorMessage('Enter both your email and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      clearPendingSignInSecondFactor();

      if (qaTicket && (!identifier || !password)) {
        const ticketAttempt = await signIn.create({
          strategy: 'ticket',
          ticket: qaTicket,
        });

        if (await completeSignInIfPossible(ticketAttempt)) {
          return;
        }

        const startedTicketSecondFactor = await beginSignInSecondFactorChallenge(ticketAttempt);
        if (startedTicketSecondFactor) {
          return;
        }

        setInfoMessage('Clerk ticket sign-in needs another step. Complete it and retry.');
        return;
      }

      let attempt = await signIn.create({
        strategy: 'password',
        identifier,
        password,
      });

      if (await completeSignInIfPossible(attempt)) {
        return;
      }

      // Clerk may return `needs_client_trust` when bot-detection is active.
      // The status is not in the SDK type definitions yet, so we compare via
      // a string cast.  Retrying with `attemptFirstFactor` using the password
      // strategy often resolves the trust gate without requiring a CAPTCHA.
      let didAttemptFirstFactor = false;
      if ((attempt.status as string) === 'needs_client_trust') {
        try {
          attempt = await signIn.attemptFirstFactor({
            strategy: 'password',
            password,
          });
          didAttemptFirstFactor = true;

          if (await completeSignInIfPossible(attempt)) {
            return;
          }
        } catch {
          // If the retry also fails, fall through to the normal flow below.
        }
      }

      if (
        !didAttemptFirstFactor &&
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
          attempt = await signIn.create({
            strategy: 'ticket',
            ticket: qaTicket,
          });

          if (await completeSignInIfPossible(attempt)) {
            return;
          }
        }
      }

      const startedSecondFactor = await beginSignInSecondFactorChallenge(attempt);
      if (startedSecondFactor) {
        return;
      }

      if (attempt.status === 'needs_identifier') {
        setInfoMessage(
          'Clerk requires a pending sign-in step. For QA smoke, set EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET and retry.',
        );
        return;
      }

      if ((attempt.status as string) === 'needs_client_trust') {
        setInfoMessage(
          'Clerk bot-detection could not be resolved automatically. Try signing in with your username instead of email.',
        );
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
    beginSignInSecondFactorChallenge,
    loginEmail,
    password,
    signIn,
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
    const profileParts = buildSignUpProfileParts({
      username: registerUsername,
      displayName: registerDisplayName,
    });
    if (!password) {
      setErrorMessage('Enter a password to create your account.');
      return;
    }
    if ('error' in profileParts) {
      setErrorMessage(profileParts.error);
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
        username: profileParts.username,
        firstName: profileParts.firstName,
        lastName: profileParts.lastName,
        unsafeMetadata: {
          username: profileParts.username,
          displayName: profileParts.displayName,
        },
      });
      await savePendingSignUpIdentity({
        email: emailAddress,
        username: profileParts.username,
        displayName: profileParts.displayName,
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
    registerDisplayName,
    registerEmail,
    registerUsername,
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
      return 'Pick your username, display name, email, and password. Clerk verifies your email, then Vulu creates your canonical profile.';
    }
    if (mode === 'login') {
      return 'Use your email or username and password. Vulu restores the same vulu_user_id after sign-in.';
    }
    if (mode === 'verify') {
      return 'Email verification is required before the app unlocks your SpacetimeDB-backed data.';
    }
    if (mode === 'forgot-password') {
      return 'Enter your email or username. We will email a reset code to the account email, then you can choose a new password.';
    }
    return 'Clerk authenticates the session. SpacetimeDB owns the user record, roles, balances, and messages.';
  }, [mode]);

  const statusHint = useMemo(() => {
    if (mode !== 'verify' && syncError) {
      return syncError;
    }
    if (mode === 'verify' && hasSession && needsVerification) {
      return 'You are signed in, but the app stays locked until the primary email address is verified.';
    }
    if (mode !== 'verify' && hasSession && !isSignedIn && status === 'syncing') {
      return 'Your Clerk session is active. Vulu is reconnecting to SpacetimeDB.';
    }
    return null;
  }, [hasSession, isSignedIn, mode, needsVerification, status, syncError]);

  return (
    <AppScreen style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            {title}
          </AppText>
          <AppText secondary style={styles.subtitle}>
            {subtitle}
          </AppText>
        </View>

        {mode === 'welcome' ? (
          <View style={styles.buttonGroup}>
            <AppButton
              title="Sign in"
              onPress={() => router.replace('/(auth)/login')}
              disabled={!isSessionLoaded}
              icon="log-in-outline"
            />
            <AppButton
              title="Create account"
              onPress={() => router.replace('/(auth)/register')}
              variant="outline"
              disabled={!isSessionLoaded}
              icon="person-add-outline"
            />
          </View>
        ) : null}

        {mode === 'login' ? (
          <View style={styles.form}>
            <AppTextInput
              autoCapitalize="none"
              autoComplete="username"
              onChangeText={setLoginEmail}
              placeholder="Email or username"
              style={styles.input}
              value={loginEmail}
            />
            <AppTextInput
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <AppButton
              title="Sign in"
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
              autoCapitalize="words"
              autoComplete="name"
              onChangeText={setRegisterDisplayName}
              placeholder="Display name"
              style={styles.input}
              value={registerDisplayName}
            />
            <AppTextInput
              autoCapitalize="none"
              autoComplete="username-new"
              onChangeText={setRegisterUsername}
              placeholder="Username"
              style={styles.input}
              value={registerUsername}
            />
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

        {errorMessage ? (
          <AppText variant="small" style={styles.errorText}>
            {errorMessage}
          </AppText>
        ) : null}

        {infoMessage ? (
          <AppText variant="small" style={styles.infoText}>
            {infoMessage}
          </AppText>
        ) : null}

        {statusHint ? (
          <AppText variant="small" secondary style={styles.hintText}>
            {statusHint}
          </AppText>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
  },
  form: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonGroup: {
    gap: spacing.sm,
  },
  errorText: {
    color: colors.accentDanger,
  },
  infoText: {
    color: colors.accentPrimary,
  },
  resetPrompt: {
    color: colors.textSecondary,
  },
  hintText: {
    color: colors.textMuted,
  },
});
