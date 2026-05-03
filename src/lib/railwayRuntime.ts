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

const noopUnsubscribe = () => {};

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

export const railwayDb: { db: any; reducers: any } = {
  db: {},
  reducers: {},
};

export function connectRailway(): void {}

export function disconnectRailway(): void {}

export async function setRailwayAuthToken(_token: string | null): Promise<void> {}

export async function signOutRailwayAuth(): Promise<void> {
  authSnapshot = {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    token: null,
  };
}

export function setTokenRefreshHandler(_handler: (() => Promise<string | null>) | null): void {}

export function getRailwayAuthSnapshot(): RailwayAuthSnapshot {
  return authSnapshot;
}

export function getRailwayTelemetrySnapshot(): RailwayTelemetrySnapshot {
  return {
    configuredUri: 'railway://disabled',
    configuredDatabaseName: 'railway',
    resolvedDatabaseIdentity: null,
    resolvedDatabaseOwnerIdentity: null,
    resolvedDatabaseFetchedAt: null,
    connectionState: 'idle',
    subscriptionState: 'idle',
    lastError: null,
    lastDataChangeReason: null,
    lastDataChangeAt: null,
    lastSubscriptionAppliedAt: null,
    subscriptionAttemptCount: 0,
    subscriptionRetryCount: 0,
    recoveryCount: 0,
    lastRecoveryReason: null,
    lastRecoveryAt: null,
    dataChangeCount: 0,
    coreRowCounts: emptyCoreRowCounts,
    updatedAt: Date.now(),
  };
}

export function subscribeRailwayTelemetry(
  _listener: (snapshot: RailwayTelemetrySnapshot) => void,
): () => void {
  return noopUnsubscribe;
}

export function subscribeRailwayDataChanges(
  _listener: (event: RailwayDataChangeEvent) => void,
): () => void {
  return noopUnsubscribe;
}

export function isRailwayViewRequested(_viewName: string): boolean {
  return false;
}

export function isRailwayViewActive(_viewName: string): boolean {
  return false;
}

export function subscribeProfile(): () => void {
  return noopUnsubscribe;
}

export function subscribeFriends(_friendUserIds: string[] = []): () => void {
  return noopUnsubscribe;
}

export function subscribeLive(_liveId: string): () => void {
  return noopUnsubscribe;
}

export function subscribeBootstrap(): () => void {
  return noopUnsubscribe;
}

export function subscribeGlobalChat(
  _roomId: string = 'global',
  _options: Record<string, unknown> = {},
): () => void {
  return noopUnsubscribe;
}

export function subscribeLeaderboard(): () => void {
  return noopUnsubscribe;
}

export function subscribeConversation(
  _conversationId: string,
  _options: Record<string, unknown> = {},
): () => void {
  return noopUnsubscribe;
}
