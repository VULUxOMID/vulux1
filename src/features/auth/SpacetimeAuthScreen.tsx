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
  const [registerEmail, setRegisterEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const canUseSignIn = isSignInLoaded && Boolean(signIn) && Boolean(setActiveSignIn);
  const canUseSignUp = isSignUpLoaded && Boolean(signUp) && Boolean(setActiveSignUp);

  const navigateToHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleSignIn = useCallback(async () => {
    if (!canUseSignIn || !signIn || !setActiveSignIn) {
      setErrorMessage('Clerk is still loading. Please try again in a moment.');
      return;
    }

    const identifier = normalizeIdentifier(loginEmail);
    if (!identifier || !password) {
      setErrorMessage('Enter both your email and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const attempt = await signIn.create({
        identifier,
        password,
      });

      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActiveSignIn({ session: attempt.createdSessionId });
        navigateToHome();
        return;
      }

      setInfoMessage(
        'Your sign-in needs another step in Clerk. Complete the pending step and try again.',
      );
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
    loginEmail,
    navigateToHome,
    password,
    setActiveSignIn,
    signIn,
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
      return 'Use your email and password. Clerk verifies your email, then SpacetimeDB creates the canonical vulu_user_id.';
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
