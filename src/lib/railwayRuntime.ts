import { getConfiguredBackendBaseUrl } from '../config/backendBaseUrl';
import { requestBackendRefresh } from '../data/adapters/backend/refreshBus';

export type RailwayConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type RailwaySubscriptionState = 'idle' | 'subscribing' | 'active' | 'error';

export type RailwayTelemetrySnapshot = {
  configuredUri: string;
  configuredDatabaseName: string;
  resolvedDatabaseIdentity: string | null;
  resolvedDatabaseOwnerIdentity: string | null;
  resolvedDatabaseFetchedAt: number | null;
  connectionState: RailwayConnectionState;
  subscriptionState: RailwaySubscriptionState;
  lastError: string | null;
  lastDataChangeReason: string | null;
  lastDataChangeAt: number | null;
  lastSubscriptionAppliedAt: number | null;
  subscriptionAttemptCount: number;
  subscriptionRetryCount: number;
  recoveryCount: number;
  lastRecoveryReason: string | null;
  lastRecoveryAt: number | null;
  dataChangeCount: number;
  coreRowCounts: {
    globalMessages: number;
    socialUsers: number;
    userProfiles: number;
    friendships: number;
    conversations: number;
    notifications: number;
    lives: number;
  };
  updatedAt: number;
};

export type RailwayDataChangeEvent = {
  scopes: string[];
  reason: string;
};

export type RailwayAuthSnapshot = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  token: string | null;
};

const emptyCoreRowCounts = {
  globalMessages: 0,
  socialUsers: 0,
  userProfiles: 0,
  friendships: 0,
  conversations: 0,
  notifications: 0,
  lives: 0,
};

let authSnapshot: RailwayAuthSnapshot = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  token: null,
};

const dataChangeListeners = new Set<(event: RailwayDataChangeEvent) => void>();
const telemetryListeners = new Set<(snapshot: RailwayTelemetrySnapshot) => void>();
const requestedViews = new Set<string>();
const activeViews = new Set<string>();
let connectionState: RailwayConnectionState = 'idle';
let subscriptionState: RailwaySubscriptionState = 'idle';
let lastError: string | null = null;
let lastDataChangeReason: string | null = null;
let lastDataChangeAt: number | null = null;
let lastSubscriptionAppliedAt: number | null = null;
let subscriptionAttemptCount = 0;
let dataChangeCount = 0;

export const railwayDb: { db: any; reducers: any } = {
  db: {},
  reducers: {
    sendThreadMessage: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/messages/thread', payload, ['messages', 'conversations']),
    markConversationRead: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/messages/read', payload, ['messages', 'conversations']),
    sendGlobalMessage: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/messages/global', payload, ['global_messages', 'messages']),
    editGlobalMessage: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/messages/global/edit', payload, ['global_messages', 'messages']),
    deleteGlobalMessage: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/messages/global/delete', payload, ['global_messages', 'messages']),
    setSocialStatus: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/social/update-status', payload, ['social', 'friendships']),
    startLive: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/start-live', payload, ['live', 'social']),
    start_live: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/start-live', payload, ['live', 'social']),
    updateLive: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/update-live', payload, ['live']),
    update_live: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/update-live', payload, ['live']),
    endLive: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/end-live', payload, ['live', 'social']),
    end_live: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/end-live', payload, ['live', 'social']),
    setLivePresence: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/set-presence', payload, ['live']),
    set_live_presence: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/set-presence', payload, ['live']),
    banLiveUser: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/ban', payload, ['live']),
    ban_live_user: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/ban', payload, ['live']),
    unbanLiveUser: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/unban', payload, ['live']),
    unban_live_user: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/unban', payload, ['live']),
    boostLive: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/boost', payload, ['live', 'leaderboard', 'wallet']),
    boost_live: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/boost', payload, ['live', 'leaderboard', 'wallet']),
    tickLiveEvent: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/tick', payload, ['live']),
    tick_live_event: (payload: Record<string, unknown>) =>
      postRailwayReducer('/api/live/tick', payload, ['live']),
  },
};

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function emitTelemetry(): void {
  const snapshot = getRailwayTelemetrySnapshot();
  telemetryListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      if (isDevRuntime()) {
        console.warn('[railway-runtime] telemetry listener failed', error);
      }
    }
  });
}

function emitDataChange(event: RailwayDataChangeEvent): void {
  lastDataChangeReason = event.reason;
  lastDataChangeAt = Date.now();
  dataChangeCount += 1;
  dataChangeListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      if (isDevRuntime()) {
        console.warn('[railway-runtime] data-change listener failed', error);
      }
    }
  });
  emitTelemetry();
}

function markViewActive(viewName: string): void {
  requestedViews.add(viewName);
  activeViews.add(viewName);
  subscriptionState = 'active';
  lastSubscriptionAppliedAt = Date.now();
  subscriptionAttemptCount += 1;
  emitTelemetry();
}

function unmarkViewActive(viewName: string): void {
  activeViews.delete(viewName);
  if (activeViews.size === 0) {
    subscriptionState = requestedViews.size > 0 ? 'idle' : 'idle';
  }
  emitTelemetry();
}

async function postRailwayReducer(
  path: string,
  payload: Record<string, unknown>,
  scopes: string[],
): Promise<void> {
  const baseUrl = getConfiguredBackendBaseUrl();
  const token = authSnapshot.token?.trim();
  if (!baseUrl || !token) {
    throw new Error('Railway API reducer transport is not configured.');
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    lastError = message || `Railway reducer failed (${response.status})`;
    connectionState = 'error';
    emitTelemetry();
    throw new Error(lastError);
  }

  connectionState = 'connected';
  lastError = null;
  emitDataChange({
    scopes,
    reason: `reducer:${path}`,
  });
  requestBackendRefresh({
    scopes,
    source: 'manual',
    reason: `reducer:${path}`,
  });
}

export function connectRailway(): void {
  connectionState = getConfiguredBackendBaseUrl() ? 'connected' : 'disconnected';
  emitTelemetry();
}

export function disconnectRailway(): void {
  connectionState = 'disconnected';
  subscriptionState = 'idle';
  activeViews.clear();
  emitTelemetry();
}

export async function setRailwayAuthToken(token: string | null): Promise<void> {
  authSnapshot = {
    ...authSnapshot,
    isLoaded: true,
    isSignedIn: Boolean(token && authSnapshot.userId),
    token: token?.trim() || null,
  };
  emitTelemetry();
}

export function setRailwayAuthSnapshot(snapshot: Partial<RailwayAuthSnapshot>): void {
  const token =
    snapshot.token === null
      ? null
      : typeof snapshot.token === 'string'
        ? snapshot.token.trim() || null
        : authSnapshot.token;
  authSnapshot = {
    ...authSnapshot,
    ...snapshot,
    token,
  };
  emitTelemetry();
}

export async function signOutRailwayAuth(): Promise<void> {
  authSnapshot = {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    token: null,
  };
  emitDataChange({
    scopes: ['identity', 'profile', 'wallet', 'social', 'messages'],
    reason: 'auth:sign-out',
  });
}

export function setTokenRefreshHandler(_handler: (() => Promise<string | null>) | null): void {
  // Clerk owns token refresh. The current token is pushed by DataProvider.
}

export function getRailwayAuthSnapshot(): RailwayAuthSnapshot {
  return authSnapshot;
}

export function getRailwayTelemetrySnapshot(): RailwayTelemetrySnapshot {
  return {
    configuredUri: getConfiguredBackendBaseUrl() || 'railway://unconfigured',
    configuredDatabaseName: 'railway',
    resolvedDatabaseIdentity: null,
    resolvedDatabaseOwnerIdentity: null,
    resolvedDatabaseFetchedAt: null,
    connectionState,
    subscriptionState,
    lastError,
    lastDataChangeReason,
    lastDataChangeAt,
    lastSubscriptionAppliedAt,
    subscriptionAttemptCount,
    subscriptionRetryCount: 0,
    recoveryCount: 0,
    lastRecoveryReason: null,
    lastRecoveryAt: null,
    dataChangeCount,
    coreRowCounts: emptyCoreRowCounts,
    updatedAt: Date.now(),
  };
}

export function subscribeRailwayTelemetry(
  listener: (snapshot: RailwayTelemetrySnapshot) => void,
): () => void {
  telemetryListeners.add(listener);
  listener(getRailwayTelemetrySnapshot());
  return () => {
    telemetryListeners.delete(listener);
  };
}

export function subscribeRailwayDataChanges(
  listener: (event: RailwayDataChangeEvent) => void,
): () => void {
  dataChangeListeners.add(listener);
  return () => {
    dataChangeListeners.delete(listener);
  };
}

export function isRailwayViewRequested(viewName: string): boolean {
  return requestedViews.has(viewName);
}

export function isRailwayViewActive(viewName: string): boolean {
  return activeViews.has(viewName);
}

export function subscribeProfile(): () => void {
  const viewName = 'profile';
  markViewActive(viewName);
  return () => unmarkViewActive(viewName);
}

export function subscribeFriends(_friendUserIds: string[] = []): () => void {
  const viewName = 'friendships';
  markViewActive(viewName);
  return () => unmarkViewActive(viewName);
}

export function subscribeLive(liveId: string): () => void {
  const viewName = liveId ? `live:${liveId}` : 'live';
  markViewActive(viewName);
  markViewActive('live');
  return () => {
    unmarkViewActive(viewName);
    unmarkViewActive('live');
  };
}

export function subscribeBootstrap(): () => void {
  const viewName = 'bootstrap';
  markViewActive(viewName);
  return () => unmarkViewActive(viewName);
}

export function subscribeGlobalChat(
  roomId: string = 'global',
  _options: Record<string, unknown> = {},
): () => void {
  const viewName = `global_chat:${roomId}`;
  markViewActive(viewName);
  markViewActive('global_messages');
  return () => {
    unmarkViewActive(viewName);
    unmarkViewActive('global_messages');
  };
}

export function subscribeLeaderboard(): () => void {
  const viewName = 'leaderboard';
  markViewActive(viewName);
  return () => unmarkViewActive(viewName);
}

export function subscribeConversation(
  conversationId: string,
  _options: Record<string, unknown> = {},
): () => void {
  const viewName = conversationId ? `conversation:${conversationId}` : 'my_conversation_messages';
  markViewActive(viewName);
  markViewActive('my_conversations');
  markViewActive('my_conversation_messages');
  return () => {
    unmarkViewActive(viewName);
    unmarkViewActive('my_conversations');
    unmarkViewActive('my_conversation_messages');
  };
}
