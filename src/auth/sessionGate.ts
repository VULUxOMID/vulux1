export type SessionGateInput = {
  isAuthLoaded: boolean;
  hasSession: boolean;
  isSignedIn: boolean;
  userId: string | null | undefined;
  isFocused?: boolean;
  isAppActive?: boolean;
};

export type SessionGateState = {
  hasAuthenticatedSession: boolean;
  isSessionResolving: boolean;
  shouldShowSignInRequired: boolean;
  canRunForegroundQueries: boolean;
};

function normalizeUserId(userId: string | null | undefined): string | null {
  if (typeof userId !== 'string') {
    return null;
  }
  const normalizedUserId = userId.trim();
  return normalizedUserId.length > 0 ? normalizedUserId : null;
}

export function resolveSessionGate({
  isAuthLoaded,
  hasSession,
  isSignedIn,
  userId,
  isFocused = true,
  isAppActive = true,
}: SessionGateInput): SessionGateState {
  const normalizedUserId = normalizeUserId(userId);
  const hasAuthenticatedSession =
    isAuthLoaded &&
    isSignedIn &&
    normalizedUserId !== null;
  const isSessionResolving =
    !isAuthLoaded ||
    (isAuthLoaded && hasSession && !hasAuthenticatedSession);

  return {
    hasAuthenticatedSession,
    isSessionResolving,
    shouldShowSignInRequired: isAuthLoaded && !hasSession,
    canRunForegroundQueries: hasAuthenticatedSession && isFocused && isAppActive,
  };
}
