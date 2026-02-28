import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth as useSessionAuth, useUser as useSessionUser } from '../auth/spacetimeSession';
import { AppState, type AppStateStatus } from 'react-native';

import type { Repositories } from './contracts';
import type { BackendSnapshot } from './adapters/backend/snapshot';
import {
  BACKEND_PATCHABLE_SCOPES,
  createBackendRepositories,
  EMPTY_BACKEND_SNAPSHOT,
  loadBackendSnapshotForUser,
  loadBackendSnapshotPatchForUser,
  mergeBackendSnapshot,
} from './adapters/backend';
import { createBackendHttpClientFromEnv } from './adapters/backend/httpClient';
import { createBackendRealtimeClient, type BackendRealtimeStatus } from './adapters/backend/realtimeClient';
import {
  requestBackendRefresh,
  subscribeBackendRefresh,
  type BackendRefreshEvent,
} from './adapters/backend/refreshBus';
import { apiClient } from './api';
import { getBackendToken } from '../utils/backendToken';
import { getBackendTokenTemplate } from '../config/backendToken';
import {
  announceSpacetimeUserProfile,
  connectSpacetimeDB,
  disconnectSpacetimeDB,
  subscribeSpacetimeDataChanges,
  subscribeSpacetimeTelemetry,
} from '../lib/spacetime';

const DataContext = createContext<Repositories | undefined>(undefined);
const patchableScopesSet = new Set<string>(BACKEND_PATCHABLE_SCOPES);
const noSnapshotScopesSet = new Set<string>(['counts']);
const REALTIME_PREFLIGHT_RETRY_MS = 10_000;

function readPositiveMsEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const FAST_FALLBACK_REFRESH_MS = readPositiveMsEnv('EXPO_PUBLIC_FAST_FALLBACK_REFRESH_MS', 800);
const FULL_FALLBACK_REFRESH_MS = readPositiveMsEnv('EXPO_PUBLIC_FULL_FALLBACK_REFRESH_MS', 45_000);
const SPACETIME_POLL_REFRESH_MS = readPositiveMsEnv('EXPO_PUBLIC_SPACETIME_POLL_REFRESH_MS', 1_500);
const FAST_FALLBACK_SCOPES = [
  'messages',
  'conversations',
  'global_messages',
  'notifications',
  'counts',
];
const SPACETIME_POLL_SCOPES = [
  'global_messages',
  'messages',
  'conversations',
  'notifications',
  'social',
  'friendships',
  'search',
  'live',
];
const PRESENCE_RECONCILE_COOLDOWN_MS = 15_000;

function isForegroundAppState(state: AppStateStatus): boolean {
  return state !== 'background';
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  return Array.from(new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean)));
}

function mergeRefreshEvents(
  previous: BackendRefreshEvent | null,
  next: BackendRefreshEvent,
): BackendRefreshEvent {
  if (!previous) return next;
  return {
    forceFull: previous.forceFull === true || next.forceFull === true,
    source: next.source ?? previous.source,
    reason: next.reason ?? previous.reason,
    scopes: normalizeScopes([...(previous.scopes ?? []), ...(next.scopes ?? [])]),
  };
}

function getRefreshPlan(event?: BackendRefreshEvent): {
  mode: 'none' | 'patch' | 'full';
  scopes: string[];
} {
  if (event?.forceFull) {
    return { mode: 'full', scopes: [] };
  }

  const normalizedScopes = normalizeScopes(event?.scopes);
  if (normalizedScopes.length === 0) {
    return { mode: 'full', scopes: [] };
  }

  const scopesForSnapshot = normalizedScopes.filter((scope) => !noSnapshotScopesSet.has(scope));
  if (scopesForSnapshot.length === 0) {
    return { mode: 'none', scopes: [] };
  }

  const canPatch = scopesForSnapshot.every((scope) => patchableScopesSet.has(scope));
  if (!canPatch) {
    return { mode: 'full', scopes: [] };
  }

  return { mode: 'patch', scopes: scopesForSnapshot };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn, isLoaded: isAuthLoaded, userId } = useSessionAuth();
  const { user: sessionUser, isLoaded: isUserLoaded } = useSessionUser();
  const [backendClient] = useState(() => createBackendHttpClientFromEnv());
  const realtimeClientRef = useRef(createBackendRealtimeClient());
  const [repositories, setRepositories] = useState<Repositories>(() =>
    createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null),
  );
  const realtimeStatusRef = useRef<BackendRealtimeStatus>('disconnected');
  const currentSnapshotRef = useRef<BackendSnapshot>(EMPTY_BACKEND_SNAPSHOT);
  const mountedRef = useRef(true);
  const hydratingRef = useRef(false);
  const queuedHydrationRef = useRef(false);
  const pendingRefreshEventRef = useRef<BackendRefreshEvent | null>(null);
  const getTokenRef = useRef(getToken);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const tokenTemplate = getBackendTokenTemplate();
  const realtimeEnabled =
    (process.env.EXPO_PUBLIC_ENABLE_REALTIME?.trim().toLowerCase() ?? 'false') === 'true';
  const realtimeDisabledLogShownRef = useRef(false);
  const realtimePreflightPromiseRef = useRef<Promise<boolean> | null>(null);
  const realtimePreflightRetryAtRef = useRef(0);
  const realtimePreflightRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeConnectInFlightRef = useRef(false);
  const spacetimeReadyRefreshAtRef = useRef(0);
  const presenceReconcileAtRef = useRef(0);
  const lastHandledSpacetimeRecoveryCountRef = useRef(0);
  const sessionUsername = sessionUser?.username?.trim() ?? '';
  const sessionFullName = sessionUser?.fullName?.trim() ?? '';
  const sessionPrimaryEmail = sessionUser?.primaryEmailAddress?.emailAddress?.trim() ?? '';
  const sessionAvatarUrl = sessionUser?.imageUrl?.trim() ?? '';

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

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const lastAnnouncedProfileFingerprintRef = useRef<string | null>(null);

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
      // Allow retry after transient failures.
      if (lastAnnouncedProfileFingerprintRef.current === fingerprint) {
        lastAnnouncedProfileFingerprintRef.current = null;
      }
    });
  }, [profileAnnouncement]);

  const refreshHttpClientAuth = useCallback(async (): Promise<boolean> => {
    if (!backendClient) {
      apiClient.clearAuth();
      return false;
    }
    if (!isAuthLoaded || !isSignedIn) {
      backendClient.clearAuth();
      apiClient.clearAuth();
      return false;
    }

    try {
      const token = await getBackendToken(getTokenRef.current, tokenTemplate);
      if (!token) {
        backendClient.clearAuth();
        apiClient.clearAuth();
        return false;
      }
      backendClient.setAuth(token);
      apiClient.setAuth(token);
      return true;
    } catch (error) {
      backendClient.clearAuth();
      apiClient.clearAuth();
      if (__DEV__) {
        console.warn('[data] Failed to refresh backend auth token', error);
      }
      return false;
    }
  }, [backendClient, isAuthLoaded, isSignedIn, tokenTemplate]);

  const reconcileForegroundPresence = useCallback((reason: string) => {
    if (!backendClient) return;
    const now = Date.now();
    if (now - presenceReconcileAtRef.current < PRESENCE_RECONCILE_COOLDOWN_MS) {
      return;
    }
    presenceReconcileAtRef.current = now;

    void (async () => {
      const isAuthed = await refreshHttpClientAuth();
      if (!isAuthed) return;

      try {
        const profilePayload = await backendClient.get<{
          profile?: { presenceStatus?: string };
        }>('/profile');
        const currentPresence = profilePayload.profile?.presenceStatus?.trim().toLowerCase();
        const desiredPresence = currentPresence === 'busy' ? 'busy' : 'online';

        await backendClient.post('/profile/update', {
          updates: { presenceStatus: desiredPresence },
        });

        requestBackendRefresh({
          scopes: ['social', 'search'],
          source: 'app_state',
          reason: `presence_reconciled:${reason}:${desiredPresence}`,
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/presence] Failed to reconcile foreground presence', error);
        }
      }
    })();
  }, [backendClient, refreshHttpClientAuth]);

  const hydrateFromBackend = useCallback(async (event: BackendRefreshEvent = {}) => {
    if (!backendClient) {
      if (!mountedRef.current) return;
      currentSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null));
      return;
    }

    if (hydratingRef.current) {
      queuedHydrationRef.current = true;
      pendingRefreshEventRef.current = mergeRefreshEvents(pendingRefreshEventRef.current, event);
      return;
    }

    const isAuthed = await refreshHttpClientAuth();
    if (!isAuthed) {
      if (!mountedRef.current) return;
      currentSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null));
      return;
    }

    hydratingRef.current = true;
    let nextEvent: BackendRefreshEvent = event;
    try {
      do {
        queuedHydrationRef.current = false;
        pendingRefreshEventRef.current = null;

        const refreshPlan = getRefreshPlan(nextEvent);
        let nextSnapshot = currentSnapshotRef.current;

        if (refreshPlan.mode === 'full') {
          nextSnapshot = await loadBackendSnapshotForUser(backendClient, userId ?? null);
        } else if (refreshPlan.mode === 'patch') {
          const patch = await loadBackendSnapshotPatchForUser(
            backendClient,
            userId ?? null,
            refreshPlan.scopes,
          );
          nextSnapshot = patch
            ? mergeBackendSnapshot(currentSnapshotRef.current, patch)
            : await loadBackendSnapshotForUser(backendClient, userId ?? null);
        }

        if (!mountedRef.current) return;

        if (refreshPlan.mode !== 'none') {
          currentSnapshotRef.current = nextSnapshot;
          setRepositories(createBackendRepositories(nextSnapshot, backendClient, userId ?? null));
        }

        nextEvent = pendingRefreshEventRef.current ?? {};
      } while (queuedHydrationRef.current);
    } catch (error) {
      if (__DEV__) {
        console.warn('[data] Hydration failed; using current snapshot and live Spacetime rows', error);
      }
      if (mountedRef.current) {
        setRepositories(createBackendRepositories(currentSnapshotRef.current, backendClient, userId ?? null));
      }
    } finally {
      hydratingRef.current = false;
      pendingRefreshEventRef.current = null;
    }
  }, [backendClient, refreshHttpClientAuth, userId]);

  const runRealtimePreflight = useCallback(async (): Promise<boolean> => {
    if (!backendClient) return false;
    const now = Date.now();
    if (now < realtimePreflightRetryAtRef.current) {
      return false;
    }

    if (realtimePreflightPromiseRef.current) {
      return realtimePreflightPromiseRef.current;
    }

    const preflightTask = (async () => {
      const isAuthed = await refreshHttpClientAuth();
      if (!isAuthed) {
        realtimePreflightRetryAtRef.current = Date.now() + REALTIME_PREFLIGHT_RETRY_MS;
        return false;
      }

      try {
        await backendClient.get<{ ok?: boolean }>('/health');
        await backendClient.get<{ unreadMessages?: number; unreadNotifications?: number }>(
          '/counts/unread',
        );
        realtimePreflightRetryAtRef.current = 0;
        return true;
      } catch (error) {
        realtimePreflightRetryAtRef.current = Date.now() + REALTIME_PREFLIGHT_RETRY_MS;
        if (__DEV__) {
          console.warn('[data/realtime] preflight failed', error);
        }
        return false;
      }
    })();

    realtimePreflightPromiseRef.current = preflightTask;
    try {
      return await preflightTask;
    } finally {
      if (realtimePreflightPromiseRef.current === preflightTask) {
        realtimePreflightPromiseRef.current = null;
      }
    }
  }, [backendClient, refreshHttpClientAuth]);

  useEffect(() => {
    let active = true;

    const syncClientAuth = async () => {
      if (!backendClient) {
        apiClient.clearAuth();
        if (!active) return;
        currentSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
        setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null));
        return;
      }

      if (!isAuthLoaded || !isSignedIn) {
        backendClient.clearAuth();
        apiClient.clearAuth();
        if (!active) return;
        currentSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
        setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null));
        return;
      }

      try {
        const token = await getBackendToken(getTokenRef.current, tokenTemplate);
        if (token) {
          backendClient.setAuth(token);
          apiClient.setAuth(token);
        } else {
          backendClient.clearAuth();
          apiClient.clearAuth();
        }
      } catch (error) {
        backendClient.clearAuth();
        apiClient.clearAuth();
        if (__DEV__) {
          console.warn('[data] Failed to get backend auth token', error);
        }
      }

      if (!active) return;
      currentSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null));
    };

    void syncClientAuth();
    return () => {
      active = false;
    };
  }, [backendClient, isAuthLoaded, isSignedIn, tokenTemplate, userId]);

  useEffect(() => {
    mountedRef.current = true;
    const configured = (process.env.EXPO_PUBLIC_DATA_SOURCE || 'backend').toLowerCase();
    if (configured !== 'backend' && __DEV__) {
      console.warn(
        `[data] EXPO_PUBLIC_DATA_SOURCE="${configured}" is no longer supported. Using "backend".`,
      );
    }

    const clearRealtimePreflightRetryTimer = () => {
      if (!realtimePreflightRetryTimerRef.current) return;
      clearTimeout(realtimePreflightRetryTimerRef.current);
      realtimePreflightRetryTimerRef.current = null;
    };

    if (!isAuthLoaded || !isSignedIn) {
      clearRealtimePreflightRetryTimer();
      realtimeClientRef.current.disconnect();
      disconnectSpacetimeDB();
      realtimeStatusRef.current = 'disconnected';
      currentSnapshotRef.current = EMPTY_BACKEND_SNAPSHOT;
      setRepositories(createBackendRepositories(EMPTY_BACKEND_SNAPSHOT, backendClient, userId ?? null));
      return () => {
        mountedRef.current = false;
      };
    }

    const getRealtimeToken = async () => getBackendToken(getTokenRef.current, tokenTemplate);
    const connectRealtime = () => {
      if (!backendClient) {
        if (__DEV__ && !realtimeDisabledLogShownRef.current) {
          console.log('[data/realtime] skipped because EXPO_PUBLIC_API_BASE_URL is not configured');
          realtimeDisabledLogShownRef.current = true;
        }
        return;
      }
      if (!realtimeEnabled) {
        if (__DEV__ && !realtimeDisabledLogShownRef.current) {
          console.log('[data/realtime] disabled via EXPO_PUBLIC_ENABLE_REALTIME=false');
          realtimeDisabledLogShownRef.current = true;
        }
        return;
      }
      if (realtimeConnectInFlightRef.current) return;
      realtimeConnectInFlightRef.current = true;

      void (async () => {
        try {
          const preflightOk = await runRealtimePreflight();
          if (!preflightOk) {
            if (__DEV__) {
              console.log('[data/realtime] preflight blocked websocket connect');
            }
            realtimeStatusRef.current = 'disconnected';
            if (isForegroundAppState(appStateRef.current) && !realtimePreflightRetryTimerRef.current) {
              const delayMs = Math.max(5000, realtimePreflightRetryAtRef.current - Date.now());
              realtimePreflightRetryTimerRef.current = setTimeout(() => {
                realtimePreflightRetryTimerRef.current = null;
                connectRealtime();
              }, delayMs);
            }
            return;
          }
          clearRealtimePreflightRetryTimer();

          realtimeClientRef.current.connect({
            getToken: getRealtimeToken,
            userId: userId ?? null,
            onDataChanged: (refreshEvent) => {
              requestBackendRefresh({
                scopes: normalizeScopes(refreshEvent.scopes),
                reason: refreshEvent.reason,
                source: 'realtime',
              });
            },
            onStatusChange: (status) => {
              realtimeStatusRef.current = status;
              if (__DEV__) {
                console.log('[data/realtime] status', status);
              }
              if (status === 'connected') {
                requestBackendRefresh({
                  forceFull: true,
                  source: 'realtime',
                  reason: 'realtime_connected',
                });
                return;
              }
            },
          });
        } finally {
          realtimeConnectInFlightRef.current = false;
        }
      })();
    };

    const refreshRepositoriesFromCurrentSnapshot = () => {
      if (!mountedRef.current) return;
      setRepositories(
        createBackendRepositories(currentSnapshotRef.current, backendClient, userId ?? null),
      );
    };

    const unsubscribeRefresh = subscribeBackendRefresh((refreshEvent) => {
      if (!isForegroundAppState(appStateRef.current)) return;
      void hydrateFromBackend(refreshEvent);
    });
    const unsubscribeSpacetimeDataChanges = subscribeSpacetimeDataChanges((event) => {
      if (!isForegroundAppState(appStateRef.current)) return;
      // Keep UI tables fresh even if HTTP snapshot hydration fails or is disabled.
      refreshRepositoriesFromCurrentSnapshot();
      requestBackendRefresh({
        scopes: normalizeScopes(event.scopes),
        reason: event.reason,
        source: 'realtime',
      });
    });
    const unsubscribeSpacetimeTelemetry = subscribeSpacetimeTelemetry((snapshot) => {
      if (!isForegroundAppState(appStateRef.current)) return;

      if (snapshot.recoveryCount > lastHandledSpacetimeRecoveryCountRef.current) {
        lastHandledSpacetimeRecoveryCountRef.current = snapshot.recoveryCount;
        requestBackendRefresh({
          forceFull: true,
          source: 'realtime',
          reason: `spacetimedb_recovery:${
            snapshot.lastRecoveryReason ?? `count_${snapshot.recoveryCount}`
          }`,
        });
      }

      const spacetimeReady =
        snapshot.connectionState === 'connected' && snapshot.subscriptionState === 'active';
      if (!spacetimeReady) return;

      const now = Date.now();
      if (now - spacetimeReadyRefreshAtRef.current < 1_000) {
        return;
      }
      spacetimeReadyRefreshAtRef.current = now;
      requestBackendRefresh({
        forceFull: true,
        source: 'realtime',
        reason: 'spacetimedb_subscription_active',
      });
    });
    if (isForegroundAppState(appStateRef.current)) {
      connectSpacetimeDB();
      announceCurrentUserProfile();
      reconcileForegroundPresence('session_start');
      void hydrateFromBackend({
        forceFull: true,
        source: 'manual',
        reason: 'initial_hydration',
      });
      connectRealtime();
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasForeground = isForegroundAppState(appStateRef.current);
      appStateRef.current = nextState;
      const isForeground = isForegroundAppState(nextState);

      if (!wasForeground && isForeground) {
        connectSpacetimeDB();
        announceCurrentUserProfile();
        reconcileForegroundPresence('app_foreground');
        void hydrateFromBackend({
          forceFull: true,
          source: 'app_state',
          reason: 'app_became_foreground',
        });
        connectRealtime();
      } else if (!isForeground) {
        realtimeClientRef.current.disconnect();
        disconnectSpacetimeDB();
        realtimeStatusRef.current = 'disconnected';
      }
    });

    return () => {
      mountedRef.current = false;
      appStateSubscription.remove();
      unsubscribeRefresh();
      unsubscribeSpacetimeDataChanges();
      unsubscribeSpacetimeTelemetry();
      clearRealtimePreflightRetryTimer();
      realtimeClientRef.current.disconnect();
      disconnectSpacetimeDB();
      realtimeStatusRef.current = 'disconnected';
    };
  }, [
    backendClient,
    hydrateFromBackend,
    isAuthLoaded,
    isSignedIn,
    announceCurrentUserProfile,
    reconcileForegroundPresence,
    realtimeEnabled,
    runRealtimePreflight,
    tokenTemplate,
    userId,
  ]);

  useEffect(() => {
    if (!backendClient) return;
    if (!isAuthLoaded || !isSignedIn) return;

    const runFastFallbackRefresh = () => {
      if (!isForegroundAppState(appStateRef.current)) return;
      if (realtimeStatusRef.current === 'connected') return;
      requestBackendRefresh({
        scopes: FAST_FALLBACK_SCOPES,
        source: 'fallback',
        reason: 'realtime_disconnected_fast',
      });
    };

    const runFullFallbackRefresh = () => {
      if (!isForegroundAppState(appStateRef.current)) return;
      if (realtimeStatusRef.current === 'connected') return;
      requestBackendRefresh({
        forceFull: true,
        source: 'fallback',
        reason: 'realtime_disconnected_full',
      });
    };

    runFastFallbackRefresh();

    const fastFallbackInterval = setInterval(runFastFallbackRefresh, FAST_FALLBACK_REFRESH_MS);
    const fullFallbackInterval = setInterval(runFullFallbackRefresh, FULL_FALLBACK_REFRESH_MS);

    return () => {
      clearInterval(fastFallbackInterval);
      clearInterval(fullFallbackInterval);
    };
  }, [backendClient, isAuthLoaded, isSignedIn, realtimeEnabled]);

  useEffect(() => {
    if (backendClient) return;
    if (!isAuthLoaded || !isSignedIn) return;

    const runSpacetimePollRefresh = () => {
      if (!isForegroundAppState(appStateRef.current)) return;
      requestBackendRefresh({
        scopes: SPACETIME_POLL_SCOPES,
        source: 'fallback',
        reason: 'spacetimedb_poll_refresh',
      });
    };

    runSpacetimePollRefresh();

    const pollInterval = setInterval(runSpacetimePollRefresh, SPACETIME_POLL_REFRESH_MS);
    return () => {
      clearInterval(pollInterval);
    };
  }, [backendClient, isAuthLoaded, isSignedIn]);

  useEffect(() => {
    if (!isForegroundAppState(appStateRef.current)) return;
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
