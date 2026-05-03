import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import {
  useAuth as useRailwayAuth,
  useUser as useRailwayUser,
} from '../auth/clerkSession';
import { upsertAccountState as upsertBackendAccountState } from '../data/adapters/backend/accountState';

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
  authEmail: string | null;
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
  authEmail: null,
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
    getToken,
    signOut: signOutSession,
  } = useRailwayAuth();
  const { user: sessionUser } = useRailwayUser();
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
    throw new Error('Password updates are not supported in the current app flow.');
  }, []);

  const updateUserEmail = useCallback(async (_email: string) => {
    throw new Error('Email updates are not supported in the current app flow.');
  }, []);

  const deleteUserAccount = useCallback(async () => {
    if (!userId) {
      throw new Error('No active user session.');
    }

    const deactivated = await upsertBackendAccountState(
      null,
      getToken,
      {
        account: {
          deletedAt: Date.now(),
          deleted: true,
          updatedAt: Date.now(),
        },
      },
      userId,
    );

    if (!deactivated) {
      throw new Error('Unable to deactivate your account right now.');
    }

    await signOutSession();
  }, [getToken, signOutSession, userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: appUser,
      initializing,
      vuluUserId: userId,
      authEmail: emailAddress,
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
