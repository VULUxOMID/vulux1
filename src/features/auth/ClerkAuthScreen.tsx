import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppScreen, AppText, AppTextInput } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useAuth as useSessionAuth } from '../../auth/clerkSession';

type ClerkAuthScreenProps = {
  mode:
    | 'welcome'
    | 'login'
    | 'register'
    | 'verify'
    | 'create-password'
    | 'forgot-password'
    | 'update-password';
};

type AuthShellProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
  errorMessage?: string | null;
  infoMessage?: string | null;
};

function readErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'errors' in error) {
    const errors = (error as { errors?: Array<{ message?: string }> }).errors;
    const message = errors?.[0]?.message?.trim();
    if (message) return message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function AuthShell({ children, title, subtitle, errorMessage, infoMessage }: AuthShellProps) {
  return (
    <AppScreen noPadding style={styles.container}>
      <LinearGradient
        colors={['#23242C', '#202129', '#1D1E25']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bgBlobLeft} />
      <View style={styles.bgBlobTop} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <AppText variant="tinyBold" style={styles.eyebrow}>
              VULU
            </AppText>
          </View>
          <View style={styles.hero}>
            <AppText variant="h1" style={styles.title}>
              {title}
            </AppText>
            <AppText variant="bodyLarge" style={styles.subtitle}>
              {subtitle}
            </AppText>
          </View>

          {errorMessage ? (
            <View style={[styles.messageBox, styles.errorBox]}>
              <AppText variant="small" style={styles.errorText}>
                {errorMessage}
              </AppText>
            </View>
          ) : null}
          {infoMessage ? (
            <View style={[styles.messageBox, styles.infoBox]}>
              <AppText variant="small" style={styles.infoText}>
                {infoMessage}
              </AppText>
            </View>
          ) : null}

          <View style={styles.card}>{children}</View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function AuthButton({
  title,
  onPress,
  loading,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        isPrimary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        pressed && !loading ? styles.actionButtonPressed : null,
        loading ? styles.actionButtonDisabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isPrimary ? '#FFFFFF' : '#171A27'} />
      ) : (
        <AppText
          variant="bodyBold"
          style={isPrimary ? styles.actionButtonTextPrimary : styles.actionButtonTextSecondary}
        >
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

export function ClerkAuthScreen({ mode }: ClerkAuthScreenProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useSessionAuth();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const isRegister = mode === 'register';
  const isForgotPassword = mode === 'forgot-password';
  const isVerify = mode === 'verify';

  const copy = useMemo(() => {
    if (isRegister) {
      return {
        title: 'Create your account',
        subtitle: 'Clerk handles sign-up and Railway stores your Vulu profile after onboarding.',
        primary: 'Create account',
      };
    }
    if (isVerify) {
      return {
        title: 'Verify email',
        subtitle: 'Enter the Clerk verification code from your email.',
        primary: 'Verify account',
      };
    }
    if (isForgotPassword) {
      return {
        title: 'Reset password',
        subtitle: 'Send a Clerk password reset code to your email.',
        primary: 'Send reset code',
      };
    }
    return {
      title: 'Welcome back',
      subtitle: 'Sign in with your Clerk account to continue.',
      primary: 'Sign in',
    };
  }, [isForgotPassword, isRegister, isVerify]);

  const routeAfterAuth = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleSubmit = useCallback(async () => {
    const normalizedEmail = emailAddress.trim().toLowerCase();
    if (!isVerify && !normalizedEmail) {
      setErrorMessage('Enter your email address.');
      return;
    }
    if (isVerify && !verificationCode.trim()) {
      setErrorMessage('Enter the verification code.');
      return;
    }
    if (!isForgotPassword && !isVerify && !password.trim()) {
      setErrorMessage('Enter your password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (isRegister) {
        if (!signUp.isLoaded) throw new Error('Clerk sign-up is not ready yet.');
        await signUp.signUp.create({
          emailAddress: normalizedEmail,
          password,
        });
        await signUp.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setInfoMessage('Check your email for the Clerk verification code.');
        router.replace('/(auth)/verify-email');
        return;
      }

      if (isVerify) {
        if (!signUp.isLoaded) throw new Error('Clerk verification is not ready yet.');
        const result = await signUp.signUp.attemptEmailAddressVerification({
          code: verificationCode.trim(),
        });
        if (result.status === 'complete') {
          await signUp.setActive({ session: result.createdSessionId });
          routeAfterAuth();
          return;
        }
        setInfoMessage('Finish the remaining Clerk verification step to continue.');
        return;
      }

      if (isForgotPassword) {
        if (!signIn.isLoaded) throw new Error('Clerk sign-in is not ready yet.');
        await signIn.signIn.create({
          strategy: 'reset_password_email_code',
          identifier: normalizedEmail,
        });
        setInfoMessage('Check your email for the Clerk password reset code.');
        return;
      }

      if (!signIn.isLoaded) throw new Error('Clerk sign-in is not ready yet.');
      const result = await signIn.signIn.create({
        identifier: normalizedEmail,
        password,
      });
      if (result.status === 'complete') {
        await signIn.setActive({ session: result.createdSessionId });
        routeAfterAuth();
        return;
      }
      setInfoMessage('Finish the remaining Clerk verification step to continue.');
    } catch (error) {
      setErrorMessage(readErrorMessage(error, 'Clerk authentication failed.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    emailAddress,
    isForgotPassword,
    isRegister,
    isVerify,
    password,
    routeAfterAuth,
    router,
    signIn,
    signUp,
    verificationCode,
  ]);

  if (isLoaded && isSignedIn) {
    routeAfterAuth();
  }

  return (
    <AuthShell title={copy.title} subtitle={copy.subtitle} errorMessage={errorMessage} infoMessage={infoMessage}>
      <View style={styles.form}>
        {isVerify ? null : (
          <View style={styles.inputGroup}>
            <AppText variant="smallBold" style={styles.inputLabel}>
              Email
            </AppText>
            <AppTextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              value={emailAddress}
              onChangeText={setEmailAddress}
              style={styles.input}
            />
          </View>
        )}
        {isVerify ? (
          <View style={styles.inputGroup}>
            <AppText variant="smallBold" style={styles.inputLabel}>
              Verification code
            </AppText>
            <AppTextInput
              autoCapitalize="none"
              keyboardType="number-pad"
              placeholder="123456"
              value={verificationCode}
              onChangeText={setVerificationCode}
              style={styles.input}
            />
          </View>
        ) : null}
        {isForgotPassword || isVerify ? null : (
          <View style={styles.inputGroup}>
            <AppText variant="smallBold" style={styles.inputLabel}>
              Password
            </AppText>
            <AppTextInput
              autoCapitalize="none"
              autoComplete={isRegister ? 'new-password' : 'password'}
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
          </View>
        )}
        <AuthButton title={copy.primary} onPress={handleSubmit} loading={isSubmitting} />
        {isRegister ? (
          <AuthButton title="I already have an account" onPress={() => router.replace('/(auth)/login')} variant="secondary" />
        ) : (
          <AuthButton title="Create account" onPress={() => router.replace('/(auth)/register')} variant="secondary" />
        )}
        {!isForgotPassword ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(auth)/forgot-password')}
            style={styles.linkButton}
          >
            <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
            <AppText variant="smallBold" style={styles.linkText}>
              Reset password
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#202129',
  },
  bgBlobLeft: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    left: -90,
    top: 120,
    backgroundColor: 'rgba(255, 103, 117, 0.2)',
  },
  bgBlobTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -80,
    top: -40,
    backgroundColor: 'rgba(71, 184, 129, 0.18)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  panel: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  headerRow: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.textOnDark,
    letterSpacing: 2,
  },
  hero: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.textOnDark,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  card: {
    gap: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  messageBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBox: {
    backgroundColor: '#FDE8E8',
  },
  infoBox: {
    backgroundColor: '#E7F7EF',
  },
  errorText: {
    color: '#9B1C1C',
  },
  infoText: {
    color: '#126B43',
  },
  actionButton: {
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  actionButtonPrimary: {
    backgroundColor: colors.accentPrimarySoft,
  },
  actionButtonSecondary: {
    backgroundColor: colors.surfaceAlt,
  },
  actionButtonPressed: {
    opacity: 0.82,
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonTextPrimary: {
    color: colors.textOnDark,
  },
  actionButtonTextSecondary: {
    color: colors.textPrimary,
  },
  linkButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  linkText: {
    color: colors.textSecondary,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.textSecondary,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
  },
});
