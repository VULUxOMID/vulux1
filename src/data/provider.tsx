import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth as useSessionAuth, useUser as useSessionUser } from '../auth/spacetimeSession';
import type { Repositories } from './contracts';
import { createBackendRepositories, EMPTY_BACKEND_SNAPSHOT } from './adapters/backend';
import { upsertAccountState } from './adapters/backend/accountState';
import { subscribeBackendRefresh } from './adapters/backend/refreshBus';
import {
  announceSpacetimeUserProfile,
  connectSpacetimeDB,
  disconnectSpacetimeDB,
  subscribeSpacetimeDataChanges,
} from '../lib/spacetime';

const DataContext = createContext<Repositories | undefined>(undefined);

function readPositiveMsEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const SPACETIME_POLL_REFRESH_MS = readPositiveMsEnv('EXPO_PUBLIC_SPACETIME_POLL_REFRESH_MS', 1_500);

function isForegroundAppState(state: AppStateStatus): boolean {
  return state !== 'background';
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn, isLoaded: isAuthLoaded, userId, emailVerified } = useSessionAuth();
  const { user: sessionUser, isLoaded: isUserLoaded } = useSessionUser();
  const [repositories, setRepositories] = useState<Repositories>(() =>
    createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, null, userId ?? null),
  );
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastAnnouncedProfileFingerprintRef = useRef<string | null>(null);
  const lastSyncedAccountFingerprintRef = useRef<string | null>(null);

  const sessionUsername = sessionUser?.username?.trim() ?? '';
  const sessionFullName = sessionUser?.fullName?.trim() ?? '';
  const sessionPrimaryEmail = sessionUser?.primaryEmailAddress?.emailAddress?.trim() ?? '';
  const sessionPrimaryPhone = sessionUser?.primaryPhoneNumber?.phoneNumber?.trim() ?? '';
  const sessionAvatarUrl = sessionUser?.imageUrl?.trim() ?? '';

  const refreshRepositories = useCallback(() => {
    setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, null, userId ?? null));
  }, [userId]);

  const profileAnnouncement = useMemo(() => {
    if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !userId) {
      return null;
    }

    const username =
      sessionUsername ||
      sessionFullName ||
      sessionPrimaryEmail.split('@')[0] ||
      userId;
    const displayName = sessionFullName || username;

    return {
      userId,
      username,
      displayName,
      avatarUrl: sessionAvatarUrl,
    };
  }, [
    sessionAvatarUrl,
    sessionFullName,
    sessionPrimaryEmail,
    sessionUsername,
    isAuthLoaded,
    isSignedIn,
    isUserLoaded,
    userId,
  ]);

  const announceCurrentUserProfile = useCallback(() => {
    if (!profileAnnouncement) {
      return;
    }

    const { userId: profileUserId, username, displayName, avatarUrl } = profileAnnouncement;
    const fingerprint = JSON.stringify([profileUserId, username, displayName, avatarUrl]);
    if (lastAnnouncedProfileFingerprintRef.current === fingerprint) {
      return;
    }

    lastAnnouncedProfileFingerprintRef.current = fingerprint;
    void announceSpacetimeUserProfile({
      userId: profileUserId,
      username,
      displayName,
      avatarUrl,
    }).catch((error) => {
      if (__DEV__) {
        console.warn('[data/spacetimedb] Failed to announce profile', error);
      }
      if (lastAnnouncedProfileFingerprintRef.current === fingerprint) {
        lastAnnouncedProfileFingerprintRef.current = null;
      }
    });
  }, [profileAnnouncement]);

  useEffect(() => {
    refreshRepositories();
  }, [refreshRepositories]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !userId) {
      if (!isSignedIn) {
        lastSyncedAccountFingerprintRef.current = null;
      }
      return;
    }

    const fingerprint = JSON.stringify([
      userId,
      sessionUser?.id ?? '',
      sessionPrimaryEmail,
      sessionPrimaryPhone,
      emailVerified,
    ]);

    if (lastSyncedAccountFingerprintRef.current === fingerprint) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await upsertAccountState(
        null,
        getToken,
        {
          clerkUserId: sessionUser?.id ?? null,
          authProvider: 'clerk',
          email: sessionPrimaryEmail || undefined,
          phoneNumber: sessionPrimaryPhone || undefined,
          emailVerified,
          updatedAt: Date.now(),
        },
        userId,
      );

      if (!cancelled) {
        lastSyncedAccountFingerprintRef.current = fingerprint;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    emailVerified,
    getToken,
    isAuthLoaded,
    isSignedIn,
    isUserLoaded,
    sessionPrimaryEmail,
    sessionPrimaryPhone,
    sessionUser?.id,
    userId,
  ]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      disconnectSpacetimeDB();
      refreshRepositories();
      return;
    }

    const refreshWhileForeground = () => {
      if (!isForegroundAppState(appStateRef.current)) {
        return;
      }
      refreshRepositories();
    };

    if (isForegroundAppState(appStateRef.current)) {
      connectSpacetimeDB();
      announceCurrentUserProfile();
      refreshRepositories();
    }

    const unsubscribeSpacetimeDataChanges = subscribeSpacetimeDataChanges(() => {
      refreshWhileForeground();
    });

    const unsubscribeRefresh = subscribeBackendRefresh(() => {
      refreshWhileForeground();
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasForeground = isForegroundAppState(appStateRef.current);
      appStateRef.current = nextState;
      const isForeground = isForegroundAppState(nextState);

      if (!wasForeground && isForeground) {
        connectSpacetimeDB();
        announceCurrentUserProfile();
        refreshRepositories();
      } else if (!isForeground) {
        disconnectSpacetimeDB();
      }
    });

    const pollInterval = setInterval(() => {
      refreshWhileForeground();
    }, SPACETIME_POLL_REFRESH_MS);

    return () => {
      clearInterval(pollInterval);
      appStateSubscription.remove();
      unsubscribeRefresh();
      unsubscribeSpacetimeDataChanges();
      disconnectSpacetimeDB();
    };
  }, [announceCurrentUserProfile, isAuthLoaded, isSignedIn, refreshRepositories]);

  useEffect(() => {
    if (!isForegroundAppState(appStateRef.current)) {
      return;
    }
    announceCurrentUserProfile();
  }, [announceCurrentUserProfile]);

  return <DataContext.Provider value={repositories}>{children}</DataContext.Provider>;
}

export function useRepositories(): Repositories {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useRepositories must be used within a DataProvider');
  }
  return context;
}

export function useLiveRepo() {
  return useRepositories().live;
}

export function useSocialRepo() {
  return useRepositories().social;
}

export function useFriendshipsRepo() {
  return useRepositories().friendships;
}

export function useMessagesRepo() {
  return useRepositories().messages;
}

export function useNotificationsRepo() {
  return useRepositories().notifications;
}

export function useLeaderboardRepo() {
  return useRepositories().leaderboard;
}

export function useVideoRepo() {
  return useRepositories().video;
}

export function useMusicCatalogRepo() {
  return useRepositories().musicCatalog;
}

export function useSearchRepo() {
  return useRepositories().search;
}
