import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth as useSessionAuth, useUser as useSessionUser } from '../auth/clerkSession';
import type { Repositories } from './contracts';
import {
  createBackendRepositories,
  EMPTY_BACKEND_SNAPSHOT,
  loadBackendMediaSnapshot,
  loadBackendMessagesSnapshot,
  loadBackendSocialSnapshotForUser,
  mergeBackendSnapshot,
} from './adapters/backend';
import { createBackendHttpClientFromEnv } from './adapters/backend/httpClient';
import { upsertAccountState } from './adapters/backend/accountState';
import { subscribeBackendRefresh } from './adapters/backend/refreshBus';
import { getBackendTokenTemplate } from '../config/backendToken';
import { getBackendToken } from '../utils/backendToken';

const DataContext = createContext<Repositories | undefined>(undefined);

function readPositiveMsEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const RAILWAY_REPOSITORY_REFRESH_MS = readPositiveMsEnv('EXPO_PUBLIC_RAILWAY_REPOSITORY_REFRESH_MS', 1_500);
const RAILWAY_SOCIAL_REFRESH_MS = readPositiveMsEnv(
  'EXPO_PUBLIC_RAILWAY_REHYDRATE_MS',
  15_000,
);
const QA_DISABLE_BACKEND_SNAPSHOTS =
  process.env.EXPO_PUBLIC_QA_DISABLE_BACKEND_SNAPSHOTS?.trim() === '1';

function isForegroundAppState(state: AppStateStatus): boolean {
  return state !== 'background';
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const {
    authProvider,
    authUserId,
    getToken,
    isSignedIn,
    isLoaded: isAuthLoaded,
    userId,
    emailVerified,
  } = useSessionAuth();
  const { user: sessionUser, isLoaded: isUserLoaded } = useSessionUser();
  const [repositories, setRepositories] = useState<Repositories>(() =>
    createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, null, userId ?? null),
  );
  const backendClientRef = useRef(createBackendHttpClientFromEnv());
  const backendSnapshotRef = useRef(EMPTY_BACKEND_SNAPSHOT);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastSyncedAccountFingerprintRef = useRef<string | null>(null);
  const accountStateRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountStateRetryNonce, setAccountStateRetryNonce] = useState(0);

  const sessionPrimaryEmail = sessionUser?.primaryEmailAddress?.emailAddress?.trim() ?? '';
  const sessionPrimaryPhone = sessionUser?.primaryPhoneNumber?.phoneNumber?.trim() ?? '';

  const applyRepositories = useCallback(
    (snapshot = backendSnapshotRef.current) => {
      setRepositories(
        createBackendRepositories(snapshot, backendClientRef.current, userId ?? null),
      );
    },
    [userId],
  );

  const refreshSocialSnapshot = useCallback(async () => {
    if (QA_DISABLE_BACKEND_SNAPSHOTS) {
      return;
    }
    const client = backendClientRef.current;
    if (!client || !userId) {
      backendSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      applyRepositories(EMPTY_BACKEND_SNAPSHOT);
      return;
    }

    const token = await getBackendToken(
      getToken,
      getBackendTokenTemplate(),
    );
    if (token) {
      client.setAuth(token);
    } else {
      client.clearAuth();
      backendSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      applyRepositories(EMPTY_BACKEND_SNAPSHOT);
      return;
    }

    const socialPatch = await loadBackendSocialSnapshotForUser(client, userId);
    const nextSnapshot = socialPatch
      ? mergeBackendSnapshot(backendSnapshotRef.current, socialPatch)
      : backendSnapshotRef.current;
    backendSnapshotRef.current = nextSnapshot;
    applyRepositories(nextSnapshot);
  }, [applyRepositories, getToken, userId]);

  const refreshMediaSnapshot = useCallback(async () => {
    if (QA_DISABLE_BACKEND_SNAPSHOTS) {
      return;
    }
    const client = backendClientRef.current;
    if (!client) {
      return;
    }

    const token = await getBackendToken(
      getToken,
      getBackendTokenTemplate(),
    );
    if (!token) {
      client.clearAuth();
      return;
    }

    client.setAuth(token);
    const mediaPatch = await loadBackendMediaSnapshot(client);
    if (!mediaPatch) {
      return;
    }

    const nextSnapshot = mergeBackendSnapshot(backendSnapshotRef.current, mediaPatch);
    backendSnapshotRef.current = nextSnapshot;
    applyRepositories(nextSnapshot);
  }, [applyRepositories, getToken]);

  const refreshMessagesSnapshot = useCallback(async () => {
    if (QA_DISABLE_BACKEND_SNAPSHOTS) {
      return;
    }
    const client = backendClientRef.current;
    if (!client || !userId) {
      return;
    }

    const token = await getBackendToken(
      getToken,
      getBackendTokenTemplate(),
    );
    if (!token) {
      client.clearAuth();
      return;
    }

    client.setAuth(token);
    const messagesPatch = await loadBackendMessagesSnapshot(client, userId);
    if (!messagesPatch) {
      return;
    }

    const nextSnapshot = mergeBackendSnapshot(backendSnapshotRef.current, messagesPatch);
    backendSnapshotRef.current = nextSnapshot;
    applyRepositories(nextSnapshot);
  }, [applyRepositories, getToken, userId]);

  const clearAccountStateRetryTimer = useCallback(() => {
    if (!accountStateRetryTimerRef.current) {
      return;
    }
    clearTimeout(accountStateRetryTimerRef.current);
    accountStateRetryTimerRef.current = null;
  }, []);

  useEffect(() => {
    applyRepositories();
  }, [applyRepositories]);

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
          account: {
            authUserId: authUserId ?? sessionUser?.id ?? null,
            authProvider: authProvider ?? null,
            email: sessionPrimaryEmail || undefined,
            phoneNumber: sessionPrimaryPhone || undefined,
            emailVerified,
            updatedAt: Date.now(),
          },
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
    authProvider,
    authUserId,
    clearAccountStateRetryTimer,
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

  useEffect(() => () => {
    clearAccountStateRetryTimer();
  }, [clearAccountStateRetryTimer]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      backendClientRef.current?.clearAuth();
      backendSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      applyRepositories(EMPTY_BACKEND_SNAPSHOT);
      return;
    }

    const refreshWhileForeground = (event?: { scopes?: string[]; forceFull?: boolean }) => {
      if (!isForegroundAppState(appStateRef.current)) {
        return;
      }

      const scopes = event?.scopes ?? [];
      const shouldRefreshSocialSnapshot =
        !QA_DISABLE_BACKEND_SNAPSHOTS &&
        (event?.forceFull === true ||
          scopes.length === 0 ||
          scopes.some((scope) =>
            scope === 'social' ||
            scope === 'friendships' ||
            scope === 'notifications',
          ));
      const shouldRefreshMediaSnapshot =
        !QA_DISABLE_BACKEND_SNAPSHOTS &&
        (event?.forceFull === true ||
          scopes.some((scope) => scope === 'videos' || scope === 'music'));
      const shouldRefreshMessagesSnapshot =
        !QA_DISABLE_BACKEND_SNAPSHOTS &&
        (event?.forceFull === true ||
          scopes.some(
            (scope) => scope === 'messages' || scope === 'conversations' || scope === 'counts',
          ));

      if (shouldRefreshSocialSnapshot) {
        void refreshSocialSnapshot();
      }
      if (shouldRefreshMediaSnapshot) {
        void refreshMediaSnapshot();
      }
      if (shouldRefreshMessagesSnapshot) {
        void refreshMessagesSnapshot();
      }
      if (shouldRefreshSocialSnapshot || shouldRefreshMediaSnapshot || shouldRefreshMessagesSnapshot) {
        return;
      }

      applyRepositories();
    };

    if (isForegroundAppState(appStateRef.current)) {
      if (!QA_DISABLE_BACKEND_SNAPSHOTS) {
        void refreshSocialSnapshot();
        void refreshMediaSnapshot();
        void refreshMessagesSnapshot();
      }
    }

    const unsubscribeRefresh = subscribeBackendRefresh((event) => {
      refreshWhileForeground(event);
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasForeground = isForegroundAppState(appStateRef.current);
      appStateRef.current = nextState;
      const isForeground = isForegroundAppState(nextState);

      if (!wasForeground && isForeground) {
        if (!QA_DISABLE_BACKEND_SNAPSHOTS) {
          void refreshSocialSnapshot();
          void refreshMediaSnapshot();
          void refreshMessagesSnapshot();
        }
      }
    });

    const repositoryPollInterval = setInterval(() => {
      if (!isForegroundAppState(appStateRef.current)) {
        return;
      }
      applyRepositories();
    }, RAILWAY_REPOSITORY_REFRESH_MS);

    const backendPollInterval = QA_DISABLE_BACKEND_SNAPSHOTS
      ? null
      : setInterval(() => {
          refreshWhileForeground({
            scopes: [
              'social',
              'friendships',
              'notifications',
              'videos',
              'music',
              'messages',
              'conversations',
              'counts',
            ],
          });
        }, RAILWAY_SOCIAL_REFRESH_MS);

    return () => {
      clearInterval(repositoryPollInterval);
      if (backendPollInterval) {
        clearInterval(backendPollInterval);
      }
      appStateSubscription.remove();
      unsubscribeRefresh();
    };
  }, [
    applyRepositories,
    isAuthLoaded,
    isSignedIn,
    refreshMediaSnapshot,
    refreshMessagesSnapshot,
    refreshSocialSnapshot,
  ]);

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
