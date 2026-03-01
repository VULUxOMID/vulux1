import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import {
  useAuth as useSpacetimeAuth,
  useUser as useSpacetimeUser,
} from '../auth/spacetimeSession';
import { spacetimeDb } from '../lib/spacetime';

export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  roles: string[];
};

type AuthContextValue = {
  user: AppUser | null;
  initializing: boolean;
  vuluUserId: string | null;
  clerkEmail: string | null;
  roles: string[];
  signOut: () => Promise<void>;
  updateUserPassword: (password: string) => Promise<void>;
  updateUserEmail: (email: string) => Promise<void>;
  deleteUserAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const defaultAuthValue: AuthContextValue = {
  user: null,
  initializing: false,
  vuluUserId: null,
  clerkEmail: null,
  roles: [],
  signOut: async () => { },
  updateUserPassword: async () => { },
  updateUserEmail: async () => { },
  deleteUserAccount: async () => { },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    isLoaded,
    isSignedIn,
    hasSession,
    needsVerification,
    userId,
    emailAddress,
    emailVerified,
    roles,
    signOut: signOutSession,
  } = useSpacetimeAuth();
  const { user: sessionUser } = useSpacetimeUser();
  const appUser = useMemo<AppUser | null>(() => {
    if (!userId) return null;

    const email = emailAddress ?? sessionUser?.primaryEmailAddress?.emailAddress ?? null;
    const displayName =
      sessionUser?.fullName ??
      sessionUser?.username ??
      email?.split('@')[0] ??
      userId;

    return {
      uid: userId,
      email,
      displayName,
      photoURL: sessionUser?.imageUrl ?? null,
      phoneNumber: sessionUser?.primaryPhoneNumber?.phoneNumber ?? null,
      emailVerified,
      isAnonymous: false,
      roles,
    };
  }, [emailAddress, emailVerified, roles, sessionUser, userId]);

  const initializing = !isLoaded || (hasSession && !isSignedIn && !needsVerification);

  const signOut = useCallback(async () => {
    await signOutSession();
  }, [signOutSession]);

  const updateUserPassword = useCallback(async (_password: string) => {
    throw new Error('Password updates are managed by Clerk outside the current app flow.');
  }, []);

  const updateUserEmail = useCallback(async (_email: string) => {
    throw new Error('Email updates are managed by Clerk outside the current app flow.');
  }, []);

  const deleteUserAccount = useCallback(async () => {
    if (!userId) {
      throw new Error('No active user session.');
    }

    try {
      const reducers = spacetimeDb.reducers as any;
      if (typeof reducers?.upsertAccountState === 'function') {
        await reducers.upsertAccountState({
          userId,
          updates: JSON.stringify({
            deletedAt: Date.now(),
            deleted: true,
          }),
        });
      }
    } catch {
      // Best-effort local cleanup only.
    }

    await signOutSession();
  }, [signOutSession, userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: appUser,
      initializing,
      vuluUserId: userId,
      clerkEmail: emailAddress,
      roles,
      signOut,
      updateUserPassword,
      updateUserEmail,
      deleteUserAccount,
    }),
    [
      appUser,
      emailAddress,
      deleteUserAccount,
      initializing,
      roles,
      signOut,
      updateUserEmail,
      updateUserPassword,
      userId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (__DEV__) {
      console.warn('useAuth must be used within an AuthProvider. Using default values.');
    }
    return defaultAuthValue;
  }
  return ctx;
}
