import { ClerkProvider, useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import Constants from 'expo-constants';
import { useEffect, type ReactNode } from 'react';

import { setCurrentAuthAccessTokenHandler } from './currentAuthAccessToken';
import { resolveClerkPublishableKey } from './clerkConfig';

type TokenOptions = { template?: string };

export type SessionUser = {
  id: string;
  fullName: string | null;
  username: string | null;
  imageUrl: string | null;
  primaryEmailAddress?: { emailAddress: string | null } | null;
  primaryPhoneNumber?: { phoneNumber: string | null } | null;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readEmailVerified(user: ReturnType<typeof useClerkUser>['user']): boolean {
  const status = user?.primaryEmailAddress?.verification?.status;
  return status === 'verified';
}

function readRoles(sessionClaims: unknown): string[] {
  if (!sessionClaims || typeof sessionClaims !== 'object') return [];
  const claims = sessionClaims as Record<string, unknown>;
  const candidates = [
    claims.roles,
    (claims.publicMetadata as Record<string, unknown> | undefined)?.roles,
    (claims.metadata as Record<string, unknown> | undefined)?.roles,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate.map((role) => normalizeString(role)).filter((role): role is string => Boolean(role));
  }
  return [];
}

export function ClerkSessionProvider({ children }: { children: ReactNode }) {
  const publishableKey = resolveClerkPublishableKey({
    env: process.env,
    expoExtra: Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? null,
  });

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkAccessTokenBridge>{children}</ClerkAccessTokenBridge>
    </ClerkProvider>
  );
}

function ClerkAccessTokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useClerkAuth();

  useEffect(() => {
    setCurrentAuthAccessTokenHandler(async () => {
      try {
        return normalizeString(await getToken());
      } catch {
        return null;
      }
    });

    return () => {
      setCurrentAuthAccessTokenHandler(null);
    };
  }, [getToken]);

  return <>{children}</>;
}

export function useAuth() {
  const auth = useClerkAuth();
  const { user } = useClerkUser();
  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? null;

  return {
    isLoaded: auth.isLoaded,
    isSignedIn: Boolean(auth.isSignedIn),
    hasSession: Boolean(auth.sessionId),
    needsVerification: Boolean(auth.isSignedIn && !readEmailVerified(user)),
    isRecoveryMode: false,
    status: auth.isSignedIn ? 'signed_in' : 'signed_out',
    authProvider: 'clerk',
    authUserId: auth.userId ?? null,
    userId: auth.userId ?? null,
    emailAddress,
    emailVerified: readEmailVerified(user),
    roles: readRoles(auth.sessionClaims),
    getToken: async (options?: TokenOptions) => normalizeString(await auth.getToken(options)),
    signOut: auth.signOut,
    syncError: null,
    syncErrorIsBlocking: false,
  };
}

export function useUser(): { user: SessionUser | null; isLoaded: boolean } {
  const { user, isLoaded } = useClerkUser();
  if (!user) {
    return { user: null, isLoaded };
  }

  return {
    isLoaded,
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      imageUrl: user.imageUrl,
      primaryEmailAddress: {
        emailAddress: user.primaryEmailAddress?.emailAddress ?? null,
      },
      primaryPhoneNumber: {
        phoneNumber: user.primaryPhoneNumber?.phoneNumber ?? null,
      },
    },
  };
}

export async function readCurrentAuthAccessToken(): Promise<string | null> {
  const { readCurrentAuthAccessToken: readToken } = await import('./currentAuthAccessToken');
  return readToken();
}

export function isEdgeBackendTransportSyncError(_message: string | null | undefined): boolean {
  return false;
}

export async function signInWithAppleSpike(): Promise<void> {
  throw new Error('Apple sign-in must be wired through Clerk before this action can be used.');
}
