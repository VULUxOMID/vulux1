import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth as useSessionAuth, useUser as useSessionUser } from '../auth/spacetimeSession';
import type { Repositories } from './contracts';
import { createBackendRepositories, EMPTY_BACKEND_SNAPSHOT } from './adapters/backend';
import { upsertAccountState } from './adapters/backend/accountState';
import { subscribeBackendRefresh } from './adapters/backend/refreshBus';
import {
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
  const lastSyncedAccountFingerprintRef = useRef<string | null>(null);
  const accountStateRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountStateRetryNonce, setAccountStateRetryNonce] = useState(0);

  const sessionPrimaryEmail = sessionUser?.primaryEmailAddress?.emailAddress?.trim() ?? '';
  const sessionPrimaryPhone = sessionUser?.primaryPhoneNumber?.phoneNumber?.trim() ?? '';

  const refreshRepositories = useCallback(() => {
    setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, null, userId ?? null));
  }, [userId]);

  const clearAccountStateRetryTimer = useCallback(() => {
    if (!accountStateRetryTimerRef.current) {
      return;
    }
    clearTimeout(accountStateRetryTimerRef.current);
    accountStateRetryTimerRef.current = null;
  }, []);

  useEffect(() => {
    refreshRepositories();
  }, [refreshRepositories]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !userId) {
      if (!isSignedIn) {
        lastSyncedAccountFingerprintRef.current = null;
      }
      clearAccountStateRetryTimer();
      return;
    }

    const fingerprint = JSON.stringify([
      userId,
      sessionUser?.id ?? '',
      sessionPrimaryEmail,
      sessionPrimaryPhone,
      emailVerified,
      sessionUser?.username?.trim() ?? '',
      sessionUser?.fullName?.trim() ?? '',
      sessionUser?.imageUrl?.trim() ?? '',
    ]);

    if (lastSyncedAccountFingerprintRef.current === fingerprint) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const persisted = await upsertAccountState(
        null,
        getToken,
        {
          clerkUserId: sessionUser?.id ?? null,
          authProvider: 'clerk',
          email: sessionPrimaryEmail || undefined,
          phoneNumber: sessionPrimaryPhone || undefined,
          emailVerified,
          profile: {
            username: sessionUser?.username?.trim() || undefined,
            displayName: sessionUser?.fullName?.trim() || undefined,
            name: sessionUser?.fullName?.trim() || undefined,
            avatarUrl: sessionUser?.imageUrl?.trim() || undefined,
            updatedAt: Date.now(),
          },
          updatedAt: Date.now(),
        },
        userId,
      );

      if (!cancelled) {
        if (persisted) {
          clearAccountStateRetryTimer();
          lastSyncedAccountFingerprintRef.current = fingerprint;
          return;
        }

        if (!accountStateRetryTimerRef.current) {
          accountStateRetryTimerRef.current = setTimeout(() => {
            accountStateRetryTimerRef.current = null;
            setAccountStateRetryNonce((value) => value + 1);
          }, 2_000);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountStateRetryNonce,
    clearAccountStateRetryTimer,
    emailVerified,
    getToken,
    isAuthLoaded,
    isSignedIn,
    isUserLoaded,
    sessionPrimaryEmail,
    sessionPrimaryPhone,
    sessionUser?.fullName,
    sessionUser?.id,
    sessionUser?.imageUrl,
    sessionUser?.username,
    userId,
  ]);

  useEffect(() => () => {
    clearAccountStateRetryTimer();
  }, [clearAccountStateRetryTimer]);

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
  }, [isAuthLoaded, isSignedIn, refreshRepositories]);

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
