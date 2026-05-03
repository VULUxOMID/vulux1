type AuthRouteMode =
  | 'welcome'
  | 'login'
  | 'register'
  | 'verify'
  | 'create-password'
  | 'forgot-password'
  | 'update-password';

type ResolveAuthRouteRedirectParams = {
  isLoaded: boolean;
  hasSession: boolean;
  isSignedIn: boolean;
  needsVerification: boolean;
  mode: AuthRouteMode;
};

export function resolveAuthRouteRedirect({
  isLoaded,
  hasSession,
  isSignedIn,
  needsVerification,
  mode,
}: ResolveAuthRouteRedirectParams): string | null {
  if (!isLoaded) {
    return null;
  }

  if (needsVerification) {
    return '/(auth)/login';
  }

  if (mode === 'update-password' || mode === 'create-password') {
    return null;
  }

  if (isSignedIn) {
    return '/';
  }

  if (mode === 'verify') {
    return '/(auth)/login';
  }

  return null;
}
