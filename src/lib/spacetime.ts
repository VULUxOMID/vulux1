// Polyfill for React Native / Hermes which lacks Promise.withResolvers
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import { DbConnection, type SubscriptionHandle } from './spacetimedb';
import { planScopedSubscriptionTeardown } from './spacetimeSubscriptionLifecycle';

const SPACETIMEDB_URI =
  process.env.EXPO_PUBLIC_SPACETIMEDB_URI || 'wss://maincloud.spacetimedb.com';
const SPACETIMEDB_DB_NAME = process.env.EXPO_PUBLIC_SPACETIMEDB_NAME || 'vulu-spacetime';
const RECONNECT_BASE_DELAY_MS = 900;
const RECONNECT_MAX_DELAY_MS = 8_000;
const ZERO_ROW_WATCHDOG_DELAY_MS = 9_000;
const ZERO_ROW_WATCHDOG_MAX_RECOVERIES_PER_SESSION = 3;
const SPACETIME_VERBOSE_LOGS =
  (process.env.EXPO_PUBLIC_SPACETIME_VERBOSE_LOGS?.trim().toLowerCase() ?? 'false') === 'true';

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export type SpacetimeConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type SpacetimeSubscriptionState = 'idle' | 'subscribing' | 'active' | 'error';

export type SpacetimeTelemetrySnapshot = {
  configuredUri: string;
  configuredDatabaseName: string;
  resolvedDatabaseIdentity: string | null;
  resolvedDatabaseOwnerIdentity: string | null;
  resolvedDatabaseFetchedAt: number | null;
  connectionState: SpacetimeConnectionState;
  subscriptionState: SpacetimeSubscriptionState;
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

export type SpacetimeDataChangeEvent = {
  scopes: string[];
  reason: string;
};

export type SpacetimeAuthSnapshot = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  token: string | null;
};

const telemetryListeners = new Set<(snapshot: SpacetimeTelemetrySnapshot) => void>();
let telemetrySnapshot: SpacetimeTelemetrySnapshot = {
  configuredUri: SPACETIMEDB_URI,
  configuredDatabaseName: SPACETIMEDB_DB_NAME,
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
  coreRowCounts: {
    globalMessages: 0,
    socialUsers: 0,
    userProfiles: 0,
    friendships: 0,
    conversations: 0,
    notifications: 0,
    lives: 0,
  },
  updatedAt: Date.now(),
};
let telemetryFlushScheduled = false;
const dataChangeListeners = new Set<(event: SpacetimeDataChangeEvent) => void>();
const pendingDataChangeScopes = new Set<string>();
let pendingDataChangeReason: string | null = null;
let dataChangeFlushScheduled = false;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const authListeners = new Set<(snapshot: SpacetimeAuthSnapshot) => void>();
let authToken: string | null = null;
let authUserId: string | null = null;
let authLoaded = false;
let authHydrationPromise: Promise<void> | null = null;
let authSnapshot: SpacetimeAuthSnapshot = {
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  token: null,
};

function normalizeAuthToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type TokenRefreshHandler = () => Promise<string | null>;
let tokenRefreshHandler: TokenRefreshHandler | null = null;
export function setTokenRefreshHandler(handler: TokenRefreshHandler | null): void {
  tokenRefreshHandler = handler;
}

function isLikelyJwtToken(token: string | null | undefined): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.trim().length > 0);
}

function decodeBase64UrlUtf8(base64Url: string): string | null {
  if (typeof base64Url !== 'string' || base64Url.trim().length === 0) return null;

  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (let i = 0; i < padded.length; i += 1) {
    const char = padded[i];
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      // Fallback below.
    }
  }

  try {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const percentEncoded = binary
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('');
    return decodeURIComponent(percentEncoded);
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string | null): Record<string, unknown> | null {
  const normalizedToken = normalizeAuthToken(token);
  if (!normalizedToken || !isLikelyJwtToken(normalizedToken)) return null;
  const payloadPart = normalizedToken.split('.')[1];
  if (!payloadPart) return null;
  const payloadText = decodeBase64UrlUtf8(payloadPart);
  if (!payloadText) return null;

  try {
    const parsed = JSON.parse(payloadText);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid JSON payloads.
  }

  return null;
}

function readJwtSubject(token: string | null): string | null {
  const payload = parseJwtPayload(token);
  const subject = payload?.sub;
  return typeof subject === 'string' && subject.trim().length > 0 ? subject.trim() : null;
}

function getAuthSnapshot(): SpacetimeAuthSnapshot {
  return authSnapshot;
}

function publishAuthSnapshot(): void {
  const snapshot = getAuthSnapshot();
  authListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Auth listeners should never crash the data path.
    }
  });
}

function persistAuthToken(nextToken: string | null): void {
  void nextToken;
}

function setAuthState(next: Partial<Pick<SpacetimeAuthSnapshot, 'userId' | 'token'>>): void {
  const nextUserId = next.userId !== undefined ? next.userId : authUserId;
  const nextToken = next.token !== undefined ? normalizeAuthToken(next.token) : authToken;
  const nextLoaded = true;
  const nextSignedIn = Boolean(nextToken);

  const didChange =
    nextUserId !== authUserId ||
    nextToken !== authToken ||
    nextLoaded !== authLoaded ||
    nextSignedIn !== authSnapshot.isSignedIn;

  authUserId = nextUserId;
  authToken = nextToken;
  authLoaded = nextLoaded;
  if (didChange) {
    authSnapshot = {
      isLoaded: nextLoaded,
      isSignedIn: nextSignedIn,
      userId: nextUserId,
      token: nextToken,
    };
  }
  if (didChange) {
    publishAuthSnapshot();
  }
}

async function hydrateAuthState(): Promise<void> {
  if (authLoaded) return;
  if (authHydrationPromise) {
    await authHydrationPromise;
    return;
  }

  authHydrationPromise = (async () => {
    setAuthState({
      userId: authUserId,
      token: authToken,
    });
  })();

  try {
    await authHydrationPromise;
  } finally {
    authHydrationPromise = null;
  }
}

const PUBLIC_SUBSCRIPTION_VIEWS = [
  'public_profile_summary',
  'public_leaderboard',
  'public_live_discovery',
  'public_live_presence_item',
  'event_metrics_overview',
  'event_widget_config_item',
  'global_message_item',
] as const;

const IDENTITY_SUBSCRIPTION_VIEWS = [
  'my_identity',
  'my_roles',
  'my_profile',
  'my_account_state',
  'my_profile_view_metrics',
  'my_notifications',
  'my_friendships',
  'my_conversations',
  'my_conversation_messages',
] as const;

const OPTIONAL_BOOTSTRAP_VIEWS = new Set<string>([
  'event_metrics_overview',
  'event_widget_config_item',
  'my_profile_view_metrics',
]);

const SUBSCRIPTION_VIEW_REFRESH_SCOPES: Record<string, string[]> = {
  public_profile_summary: ['social', 'search'],
  public_leaderboard: ['leaderboard'],
  public_live_discovery: ['live', 'search'],
  event_metrics_overview: ['events', 'live'],
  event_widget_config_item: ['events'],
  public_live_presence_item: ['live'],
  global_message_item: ['global_messages', 'messages'],
  track: ['music'],
  artist: ['music'],
  playlist: ['music'],
  playlist_track: ['music'],
  my_identity: ['identity'],
  my_roles: ['roles'],
  my_profile: ['profile'],
  my_account_state: ['wallet', 'profile'],
  my_profile_view_metrics: ['profile', 'counts'],
  my_notifications: ['notifications', 'counts'],
  my_friendships: ['friendships', 'social', 'search', 'counts'],
  my_conversations: ['messages', 'conversations', 'counts'],
  my_conversation_messages: ['messages', 'conversations', 'global_messages', 'counts'],
};

const SUBSCRIPTION_VIEW_TABLE_KEYS: Record<string, string[]> = {
  public_profile_summary: ['publicProfileSummary'],
  public_leaderboard: ['publicLeaderboard'],
  public_live_discovery: ['publicLiveDiscovery'],
  event_metrics_overview: ['eventMetricsOverview', 'event_metrics_overview'],
  event_widget_config_item: ['eventWidgetConfigItem', 'event_widget_config_item'],
  public_live_presence_item: ['publicLivePresenceItem', 'public_live_presence_item'],
  global_message_item: ['globalMessageItem', 'global_message_item'],
  track: ['track'],
  artist: ['artist'],
  playlist: ['playlist'],
  playlist_track: ['playlistTrack', 'playlist_track'],
  my_identity: ['myIdentity', 'my_identity'],
  my_roles: ['myRoles', 'my_roles'],
  my_profile: ['myProfile', 'my_profile'],
  my_account_state: ['myAccountState', 'my_account_state'],
  my_profile_view_metrics: ['myProfileViewMetrics', 'my_profile_view_metrics'],
  my_notifications: ['myNotifications', 'my_notifications'],
  my_friendships: ['myFriendships', 'my_friendships'],
  my_conversations: ['myConversations', 'my_conversations'],
  my_conversation_messages: ['myConversationMessages', 'my_conversation_messages'],
};

type TableListenerBinding = {
  tableKey: string;
  viewName: string;
  scopes: string[];
};

type ScopedSubscriptionSpec = {
  key: string;
  name: string;
  views: string[];
  scopes: string[];
  querySets: string[][];
  listenerBindings: TableListenerBinding[];
};

type ActiveScopedSubscription = {
  key: string;
  name: string;
  queries: string[];
  views: string[];
  scopes: string[];
  listenerBindings: TableListenerBinding[];
  handle: SubscriptionHandle;
};

export type SpacetimeMessageWindowCursor = {
  limit?: number;
  cursor?: number | string | null;
  beforeCreatedAtMs?: number | null;
  afterCreatedAtMs?: number | null;
  windowMs?: number | null;
};

const DEFAULT_CHAT_LIMIT = 180;
const MAX_CHAT_LIMIT = 400;

const EMPTY_DB_VIEW: Record<string, never> = {};
const EMPTY_REDUCERS: Record<string, never> = {};
const EMPTY_PROCEDURES: Record<string, never> = {};

let coreTableListenerDb: any = null;
let coreTableListenerTeardowns: Array<() => void> = [];
let coreTableListenerSignature = '';

function scheduleTelemetryFlush(): void {
  if (telemetryFlushScheduled) {
    return;
  }
  telemetryFlushScheduled = true;

  setTimeout(() => {
    telemetryFlushScheduled = false;
    const nextSnapshot = telemetrySnapshot;
    telemetryListeners.forEach((listener) => {
      try {
        listener(nextSnapshot);
      } catch {
        // Telemetry listeners should never crash the data path.
      }
    });
  }, 0);
}

function scheduleDataChangeFlush(): void {
  if (dataChangeFlushScheduled) {
    return;
  }
  dataChangeFlushScheduled = true;

  setTimeout(() => {
    dataChangeFlushScheduled = false;
    if (pendingDataChangeScopes.size === 0) {
      pendingDataChangeReason = null;
      return;
    }

    const nextEvent: SpacetimeDataChangeEvent = {
      scopes: Array.from(pendingDataChangeScopes),
      reason: pendingDataChangeReason ?? 'spacetimedb_table_change',
    };
    pendingDataChangeScopes.clear();
    pendingDataChangeReason = null;

    dataChangeListeners.forEach((listener) => {
      try {
        listener(nextEvent);
      } catch {
        // Data listeners should never crash the data path.
      }
    });
  }, 25);
}

function countRows(table: any): number {
  if (!table || typeof table.iter !== 'function') {
    return 0;
  }
  return Array.from(table.iter()).length;
}

function countRowsFirstAvailable(dbView: any, tableNames: string[]): number {
  for (const tableName of tableNames) {
    const count = countRows(dbView?.[tableName]);
    if (count > 0) {
      return count;
    }
  }
  return countRows(dbView?.[tableNames[0] ?? '']);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeChatLimit(limit: number | null | undefined): number {
  const parsed = toFiniteNumber(limit);
  if (parsed === null) {
    return DEFAULT_CHAT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_CHAT_LIMIT, Math.floor(parsed)));
}

function readCoreRowCounts(dbView: any): SpacetimeTelemetrySnapshot['coreRowCounts'] {
  return {
    globalMessages: countRowsFirstAvailable(dbView, [
      'myConversationMessages',
      'my_conversation_messages',
      'globalMessageItem',
    ]),
    socialUsers: countRowsFirstAvailable(dbView, ['publicProfileSummary']),
    userProfiles: countRowsFirstAvailable(dbView, ['publicProfileSummary']),
    friendships: countRowsFirstAvailable(dbView, ['myFriendships', 'my_friendships']),
    conversations: countRowsFirstAvailable(dbView, ['myConversations', 'my_conversations']),
    notifications: countRowsFirstAvailable(dbView, ['myNotifications', 'my_notifications']),
    lives: countRowsFirstAvailable(dbView, ['publicLiveDiscovery']),
  };
}

function allCoreRowCountsZero(rowCounts: SpacetimeTelemetrySnapshot['coreRowCounts']): boolean {
  return Object.values(rowCounts).every((count) => count <= 0);
}

function maybeLogVerbose(event: string, details?: Record<string, unknown>): void {
  if (!SPACETIME_VERBOSE_LOGS) {
    return;
  }
  if (details) {
    console.log(`[SpacetimeDB][diag] ${event}`, details);
  } else {
    console.log(`[SpacetimeDB][diag] ${event}`);
  }
}

function publishDataChange(scopes: string[], reason: string): void {
  const normalizedScopes = scopes
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  if (normalizedScopes.length === 0) {
    return;
  }

  normalizedScopes.forEach((scope) => pendingDataChangeScopes.add(scope));
  if (!pendingDataChangeReason) {
    pendingDataChangeReason = reason;
  }
  publishTelemetry({
    lastDataChangeReason: reason,
    lastDataChangeAt: Date.now(),
    dataChangeCount: telemetrySnapshot.dataChangeCount + 1,
  });
  scheduleDataChangeFlush();
}

function publishTelemetry(update: Partial<SpacetimeTelemetrySnapshot>): void {
  telemetrySnapshot = {
    ...telemetrySnapshot,
    ...update,
    updatedAt: Date.now(),
  };
  scheduleTelemetryFlush();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown SpacetimeDB error';
  }
}

export function getSpacetimeTelemetrySnapshot(): SpacetimeTelemetrySnapshot {
  return telemetrySnapshot;
}

export function subscribeSpacetimeTelemetry(
  listener: (snapshot: SpacetimeTelemetrySnapshot) => void,
): () => void {
  telemetryListeners.add(listener);
  setTimeout(() => {
    if (!telemetryListeners.has(listener)) return;
    try {
      listener(telemetrySnapshot);
    } catch {
      // Telemetry listeners should never crash the data path.
    }
  }, 0);
  return () => {
    telemetryListeners.delete(listener);
  };
}

export function subscribeSpacetimeDataChanges(
  listener: (event: SpacetimeDataChangeEvent) => void,
): () => void {
  dataChangeListeners.add(listener);
  return () => {
    dataChangeListeners.delete(listener);
  };
}

export function getSpacetimeAuthSnapshot(): SpacetimeAuthSnapshot {
  return getAuthSnapshot();
}

export function subscribeSpacetimeAuth(
  listener: (snapshot: SpacetimeAuthSnapshot) => void,
): () => void {
  authListeners.add(listener);
  setTimeout(() => {
    if (!authListeners.has(listener)) return;
    try {
      listener(getAuthSnapshot());
    } catch {
      // Auth listeners should never crash the data path.
    }
  }, 0);
  return () => {
    authListeners.delete(listener);
  };
}

export async function setSpacetimeAuthToken(nextToken: string | null): Promise<void> {
  const normalizedToken = normalizeAuthToken(nextToken);
  const acceptedToken = isLikelyJwtToken(normalizedToken) ? normalizedToken : null;
  setAuthState({
    userId: readJwtSubject(acceptedToken),
    token: acceptedToken,
  });
  persistAuthToken(acceptedToken);
}

let connection: DbConnection | null = null;
let activeScopedSubscription: ActiveScopedSubscription | null = null;
let desiredScopedSubscription: ScopedSubscriptionSpec | null = null;
const deferredScopedSubscriptionTeardowns = new WeakSet<SubscriptionHandle>();
let scopedSubscriptionAttemptNonce = 0;
const scopedSubscriptionRefCounts = new Map<string, number>();
let shouldMaintainConnection = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let zeroRowWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let subscriptionRetryAttempts = 0;
let sessionRecoveryAttempts = 0;
let pendingForcedReconnectReason: string | null = null;
let pendingReconnectReason: string | null = null;
let isDatabaseIdentityLookupInFlight = false;
let connectionSessionId = 0;
let connectLifecycleState: 'idle' | 'hydrating_auth' | 'connecting' | 'connected' | 'disconnecting' =
  'idle';
let connectInFlight: { sessionId: number; promise: Promise<void> } | null = null;

void hydrateAuthState();

function clearReconnectTimer(): void {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function clearZeroRowWatchdogTimer(): void {
  if (!zeroRowWatchdogTimer) return;
  clearTimeout(zeroRowWatchdogTimer);
  zeroRowWatchdogTimer = null;
}

function scheduleReconnect(reason: string): void {
  if (!shouldMaintainConnection) return;
  // Coalesce repeated reconnect requests into one debounced attempt.
  pendingReconnectReason = reason;
  if (reconnectTimer) return;
  const attempt = reconnectAttempts;
  const delayMs = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** attempt);
  reconnectAttempts = Math.min(reconnectAttempts + 1, 8);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!shouldMaintainConnection) return;
    const reconnectReason = pendingReconnectReason ?? reason;
    pendingReconnectReason = null;
    publishTelemetry({ connectionState: 'connecting', lastError: null });
    void requestConnect(`reconnect:${reconnectReason}`);
    if (isDevRuntime()) {
      console.log(`[SpacetimeDB] reconnect attempt=${attempt + 1} reason=${reconnectReason}`);
    }
  }, delayMs);
}

function parseIdentityHex(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const nested = (value as { __identity__?: unknown }).__identity__;
    if (typeof nested === 'string' && nested.trim().length > 0) {
      return nested.trim();
    }
  }
  return null;
}

function toHttpBaseFromSpacetimeUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'https://maincloud.spacetimedb.com';
  }
}

async function resolveDatabaseIdentity(): Promise<void> {
  if (isDatabaseIdentityLookupInFlight) return;

  isDatabaseIdentityLookupInFlight = true;
  try {
    const baseUrl = toHttpBaseFromSpacetimeUri(SPACETIMEDB_URI);
    const response = await fetch(
      `${baseUrl}/v1/database/${encodeURIComponent(SPACETIMEDB_DB_NAME)}`,
    );
    if (!response.ok) {
      throw new Error(`database_identity_lookup_failed:${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    publishTelemetry({
      resolvedDatabaseIdentity: parseIdentityHex(payload.database_identity),
      resolvedDatabaseOwnerIdentity: parseIdentityHex(payload.owner_identity),
      resolvedDatabaseFetchedAt: Date.now(),
    });
  } catch (error) {
    maybeLogVerbose('database_identity_lookup_failed', {
      error: toErrorMessage(error),
      uri: SPACETIMEDB_URI,
      database: SPACETIMEDB_DB_NAME,
    });
  } finally {
    isDatabaseIdentityLookupInFlight = false;
  }
}

function isSubscriptionHandleActive(handle: SubscriptionHandle | null | undefined): boolean {
  if (!handle) {
    return false;
  }
  if (typeof handle.isEnded === 'function' && handle.isEnded()) {
    return false;
  }
  if (typeof handle.isActive === 'function') {
    return handle.isActive();
  }
  return true;
}

function buildTableListenerBindings(views: string[]): TableListenerBinding[] {
  const bindingByTableKey = new Map<string, TableListenerBinding>();
  for (const viewName of views) {
    const scopes = SUBSCRIPTION_VIEW_REFRESH_SCOPES[viewName] ?? [];
    for (const tableKey of SUBSCRIPTION_VIEW_TABLE_KEYS[viewName] ?? []) {
      const existing = bindingByTableKey.get(tableKey);
      if (existing) {
        existing.scopes = uniqueStrings([...existing.scopes, ...scopes]);
        continue;
      }
      bindingByTableKey.set(tableKey, {
        tableKey,
        viewName,
        scopes: uniqueStrings(scopes),
      });
    }
  }
  return Array.from(bindingByTableKey.values());
}

function buildScopedSubscriptionSpec(
  name: string,
  key: string,
  views: string[],
  querySets: string[][],
): ScopedSubscriptionSpec {
  const uniqueViews = uniqueStrings(views);
  const scopes = uniqueStrings(
    uniqueViews.flatMap((viewName) => SUBSCRIPTION_VIEW_REFRESH_SCOPES[viewName] ?? []),
  );
  return {
    key,
    name,
    views: uniqueViews,
    scopes,
    querySets: querySets
      .map((querySet) => uniqueStrings(querySet))
      .filter((querySet) => querySet.length > 0),
    listenerBindings: buildTableListenerBindings(uniqueViews),
  };
}

function getDefaultSelectQuery(viewName: string): string {
  switch (viewName) {
    case 'global_message_item':
      // Keep full coverage but force an index-friendly range predicate.
      return "SELECT * FROM global_message_item WHERE id >= ''";
    case 'public_leaderboard':
      return "SELECT * FROM public_leaderboard WHERE user_id >= ''";
    case 'public_live_discovery':
      return "SELECT * FROM public_live_discovery WHERE live_id >= ''";
    case 'public_profile_summary':
      return "SELECT * FROM public_profile_summary WHERE user_id >= ''";
    default:
      return `SELECT * FROM ${viewName}`;
  }
}

function buildViewSelectQueries(views: string[]): string[] {
  return uniqueStrings(views.map((viewName) => getDefaultSelectQuery(viewName)));
}

function toWindowKey(windowCursor?: SpacetimeMessageWindowCursor): string {
  if (!windowCursor) {
    return 'default';
  }
  const normalized = {
    limit: normalizeChatLimit(windowCursor.limit),
    cursor: windowCursor.cursor ?? null,
    beforeCreatedAtMs: toFiniteNumber(windowCursor.beforeCreatedAtMs),
    afterCreatedAtMs: toFiniteNumber(windowCursor.afterCreatedAtMs),
    windowMs: toFiniteNumber(windowCursor.windowMs),
  };
  return JSON.stringify(normalized);
}

function buildMessageViewQueryVariants(
  viewName: string,
  targetId: string,
  targetColumns: string[],
  windowCursor?: SpacetimeMessageWindowCursor,
  options?: {
    includeFullViewFallback?: boolean;
  },
): string[] {
  const limit = normalizeChatLimit(windowCursor?.limit);
  const escapedTargetId = escapeSqlLiteral(targetId);
  const cursorNumber = toFiniteNumber(windowCursor?.cursor);
  const cursorString =
    typeof windowCursor?.cursor === 'string' && windowCursor.cursor.trim().length > 0
      ? windowCursor.cursor.trim()
      : null;
  const beforeCreatedAtMs = toFiniteNumber(windowCursor?.beforeCreatedAtMs);
  const afterCreatedAtMs = toFiniteNumber(windowCursor?.afterCreatedAtMs);
  const windowMs = toFiniteNumber(windowCursor?.windowMs);
  const windowStartMs = windowMs && windowMs > 0 ? Date.now() - windowMs : null;

  const temporalLowerBound =
    afterCreatedAtMs !== null && windowStartMs !== null
      ? Math.max(afterCreatedAtMs, windowStartMs)
      : afterCreatedAtMs ?? windowStartMs;

  const temporalColumns = ['created_at', 'updated_at'];
  const queries: string[] = [];
  const baseTargetColumns = uniqueStrings(targetColumns);
  const includeFullViewFallback = options?.includeFullViewFallback ?? true;

  // SpacetimeDB subscriptions only support: SELECT * FROM table [WHERE ...]
  // No ORDER BY, no LIMIT — use WHERE temporal filters for windowing instead.
  for (const targetColumn of baseTargetColumns) {
    const whereParts = [`${targetColumn} = '${escapedTargetId}'`];
    if (temporalLowerBound !== null) {
      whereParts.push(`created_at >= ${Math.floor(temporalLowerBound)}`);
    }
    if (beforeCreatedAtMs !== null) {
      whereParts.push(`created_at <= ${Math.floor(beforeCreatedAtMs)}`);
    }
    if (cursorNumber !== null) {
      whereParts.push(`created_at < ${Math.floor(cursorNumber)}`);
    }
    queries.push(
      `SELECT * FROM ${viewName} WHERE ${whereParts.join(' AND ')}`,
    );
  }

  // Fallback: subscribe to entire view (no LIMIT)
  if (includeFullViewFallback) {
    queries.push(getDefaultSelectQuery(viewName));
  }
  return uniqueStrings(queries);
}

function logActiveSubscriptions(active: ActiveScopedSubscription | null): void {
  if (!active) {
    console.log('[SpacetimeDB] subscriptions active: none');
    return;
  }
  console.log(
    `[SpacetimeDB] subscriptions active: ${active.name} -> ${active.views.join(', ')}`,
  );
}

function teardownScopedSubscriptionHandle(handle: SubscriptionHandle, reason: string): void {
  const isEnded = typeof handle.isEnded === 'function' && handle.isEnded();
  const isActive = typeof handle.isActive === 'function' ? handle.isActive() : true;
  const teardownPlan = planScopedSubscriptionTeardown({
    reason,
    isActive,
    isEnded,
  });

  if (teardownPlan === 'skip') {
    deferredScopedSubscriptionTeardowns.delete(handle);
    return;
  }

  if (teardownPlan === 'defer_until_applied') {
    deferredScopedSubscriptionTeardowns.add(handle);
    maybeLogVerbose('subscription_teardown_deferred_until_applied', {
      reason,
    });
    return;
  }

  deferredScopedSubscriptionTeardowns.delete(handle);
  if (typeof (handle as any).unsubscribe === 'function') {
    (handle as any).unsubscribe();
  }
}

function terminateActiveScopedSubscription(reason: string): void {
  const existing = activeScopedSubscription;
  activeScopedSubscription = null;
  if (!existing) return;

  try {
    teardownScopedSubscriptionHandle(existing.handle, reason);
  } catch (error) {
    maybeLogVerbose('subscription_terminate_failed', {
      reason,
      error: toErrorMessage(error),
    });
  }
}

function requestConnectionRecovery(reason: string): void {
  if (!shouldMaintainConnection) return;

  if (sessionRecoveryAttempts >= ZERO_ROW_WATCHDOG_MAX_RECOVERIES_PER_SESSION) {
    publishTelemetry({
      lastRecoveryReason: `recovery_limit_reached:${reason}`,
      lastRecoveryAt: Date.now(),
    });
    maybeLogVerbose('recovery_limit_reached', {
      reason,
      recoveryCount: telemetrySnapshot.recoveryCount,
    });
    return;
  }

  sessionRecoveryAttempts += 1;
  publishTelemetry({
    recoveryCount: telemetrySnapshot.recoveryCount + 1,
    lastRecoveryReason: reason,
    lastRecoveryAt: Date.now(),
  });

  clearReconnectTimer();
  clearZeroRowWatchdogTimer();
  terminateActiveScopedSubscription(`recovery:${reason}`);
  detachCoreTableListeners();

  pendingForcedReconnectReason = reason;
  const currentConnection = connection;
  if (!currentConnection) {
    pendingForcedReconnectReason = null;
    publishTelemetry({ connectionState: 'connecting', subscriptionState: 'idle' });
    scheduleReconnect(`recovery_no_connection:${reason}`);
    return;
  }

  try {
    currentConnection.disconnect();
  } catch (error) {
    pendingForcedReconnectReason = null;
    publishTelemetry({ connectionState: 'error', lastError: toErrorMessage(error) });
    scheduleReconnect(`recovery_disconnect_failed:${reason}`);
  }
}

function syncZeroRowWatchdog(
  rowCounts: SpacetimeTelemetrySnapshot['coreRowCounts'],
  reason: string,
): void {
  if (!shouldMaintainConnection || activeScopedSubscription?.name !== 'bootstrap') {
    clearZeroRowWatchdogTimer();
    return;
  }

  if (
    telemetrySnapshot.connectionState !== 'connected' ||
    telemetrySnapshot.subscriptionState !== 'active'
  ) {
    clearZeroRowWatchdogTimer();
    return;
  }

  if (!allCoreRowCountsZero(rowCounts)) {
    clearZeroRowWatchdogTimer();
    return;
  }

  if (zeroRowWatchdogTimer) {
    return;
  }

  zeroRowWatchdogTimer = setTimeout(() => {
    zeroRowWatchdogTimer = null;
    requestConnectionRecovery(`zero_row_watchdog:${reason}`);
  }, ZERO_ROW_WATCHDOG_DELAY_MS);
}

function detachCoreTableListeners(): void {
  for (const teardown of coreTableListenerTeardowns) {
    try {
      teardown();
    } catch {
      // Best-effort listener cleanup.
    }
  }
  coreTableListenerTeardowns = [];
  coreTableListenerDb = null;
  coreTableListenerSignature = '';
}

function attachCoreTableListeners(dbView: any, bindings: TableListenerBinding[]): void {
  if (!dbView) {
    return;
  }
  const normalizedBindings = bindings
    .map((binding) => ({
      ...binding,
      scopes: uniqueStrings(binding.scopes),
    }))
    .filter((binding) => binding.scopes.length > 0);
  const signature = JSON.stringify(
    normalizedBindings.map((binding) => [binding.tableKey, binding.scopes.join(',')]),
  );
  if (
    coreTableListenerDb === dbView &&
    coreTableListenerSignature === signature &&
    coreTableListenerTeardowns.length > 0
  ) {
    return;
  }

  detachCoreTableListeners();
  coreTableListenerDb = dbView;
  coreTableListenerSignature = signature;

  for (const binding of normalizedBindings) {
    const table = dbView?.[binding.tableKey];
    if (!table) {
      continue;
    }

    const onMutation = () => {
      const rowCounts = readCoreRowCounts(dbView);
      publishTelemetry({
        coreRowCounts: rowCounts,
      });
      syncZeroRowWatchdog(rowCounts, `table_mutation:${binding.tableKey}`);
      publishDataChange(binding.scopes, `spacetimedb_${binding.tableKey}_changed`);
      maybeLogVerbose(`table_mutation:${binding.tableKey}`, {
        scopes: binding.scopes,
        coreRowCounts: rowCounts,
      });
    };

    if (typeof table.onInsert === 'function') {
      table.onInsert(onMutation);
      if (typeof table.removeOnInsert === 'function') {
        coreTableListenerTeardowns.push(() => {
          table.removeOnInsert(onMutation);
        });
      }
    }
    if (typeof table.onUpdate === 'function') {
      table.onUpdate(onMutation);
      if (typeof table.removeOnUpdate === 'function') {
        coreTableListenerTeardowns.push(() => {
          table.removeOnUpdate(onMutation);
        });
      }
    }
    if (typeof table.onDelete === 'function') {
      table.onDelete(onMutation);
      if (typeof table.removeOnDelete === 'function') {
        coreTableListenerTeardowns.push(() => {
          table.removeOnDelete(onMutation);
        });
      }
    }
  }
}

function subscribeToScopedSpec(nextConnection: DbConnection, spec: ScopedSubscriptionSpec): void {
  if (spec.querySets.length === 0) {
    return;
  }

  let querySetIndex = 0;
  const attemptNonce = ++scopedSubscriptionAttemptNonce;

  const subscribeWithQuerySet = (index: number): void => {
    querySetIndex = index;
    const querySet = spec.querySets[index];
    attachCoreTableListeners(nextConnection.db as any, spec.listenerBindings);
    terminateActiveScopedSubscription('resubscribe');

    publishTelemetry({
      subscriptionState: 'subscribing',
      lastError: null,
      subscriptionAttemptCount: telemetrySnapshot.subscriptionAttemptCount + 1,
    });

    let didApply = false;
    const nextSubscription = nextConnection
      .subscriptionBuilder()
      .onApplied(() => {
        if (deferredScopedSubscriptionTeardowns.has(nextSubscription)) {
          deferredScopedSubscriptionTeardowns.delete(nextSubscription);
          try {
            teardownScopedSubscriptionHandle(nextSubscription, `deferred_apply:${spec.name}`);
          } catch (error) {
            maybeLogVerbose('subscription_deferred_teardown_apply_failed', {
              name: spec.name,
              error: toErrorMessage(error),
            });
          }
          return;
        }
        if (attemptNonce !== scopedSubscriptionAttemptNonce) {
          try {
            teardownScopedSubscriptionHandle(nextSubscription, `stale_apply:${spec.name}`);
          } catch (error) {
            maybeLogVerbose('subscription_stale_apply_teardown_failed', {
              name: spec.name,
              error: toErrorMessage(error),
            });
          }
          return;
        }
        didApply = true;
        subscriptionRetryAttempts = 0;
        activeScopedSubscription = {
          key: spec.key,
          name: spec.name,
          queries: querySet,
          views: spec.views,
          scopes: spec.scopes,
          listenerBindings: spec.listenerBindings,
          handle: nextSubscription,
        };
        const rowCounts = readCoreRowCounts(nextConnection.db as any);
        publishTelemetry({
          subscriptionState: 'active',
          lastError: null,
          lastSubscriptionAppliedAt: Date.now(),
          coreRowCounts: rowCounts,
        });
        syncZeroRowWatchdog(rowCounts, `subscription_applied:${spec.name}`);
        publishDataChange(spec.scopes, `spacetimedb_subscription_applied:${spec.name}`);
        reconnectAttempts = 0;
        pendingReconnectReason = null;
        clearReconnectTimer();
        logActiveSubscriptions(activeScopedSubscription);
      })
      .onError((ctx) => {
        deferredScopedSubscriptionTeardowns.delete(nextSubscription);
        if (attemptNonce !== scopedSubscriptionAttemptNonce) {
          return;
        }
        const errorMessage = toErrorMessage(ctx.event);
        const hasFallback = !didApply && querySetIndex + 1 < spec.querySets.length;
        if (hasFallback && desiredScopedSubscription?.key === spec.key) {
          maybeLogVerbose('subscription_query_fallback', {
            name: spec.name,
            fromIndex: querySetIndex,
            toIndex: querySetIndex + 1,
            error: errorMessage,
          });
          subscribeWithQuerySet(querySetIndex + 1);
          return;
        }

        subscriptionRetryAttempts += 1;
        const nextRetryCount = telemetrySnapshot.subscriptionRetryCount + 1;
        publishTelemetry({
          subscriptionState: 'error',
          lastError: errorMessage,
          subscriptionRetryCount: nextRetryCount,
        });
        console.error('[SpacetimeDB] scoped subscription error:', ctx.event);
        if (activeScopedSubscription?.handle === nextSubscription) {
          activeScopedSubscription = null;
        }
        clearZeroRowWatchdogTimer();
        detachCoreTableListeners();
        logActiveSubscriptions(null);
        const reason = didApply
          ? `subscription_error:${spec.name}`
          : `subscription_error_preapply_${subscriptionRetryAttempts}:${spec.name}`;
        scheduleReconnect(reason);
      })
      .subscribe(querySet);

    activeScopedSubscription = {
      key: spec.key,
      name: spec.name,
      queries: querySet,
      views: spec.views,
      scopes: spec.scopes,
      listenerBindings: spec.listenerBindings,
      handle: nextSubscription,
    };
    syncZeroRowWatchdog(readCoreRowCounts(nextConnection.db as any), 'subscription_created');
  };

  subscribeWithQuerySet(0);
}

function isDesiredScopedSubscriptionActive(): boolean {
  if (!desiredScopedSubscription || !activeScopedSubscription) {
    return false;
  }
  if (desiredScopedSubscription.key !== activeScopedSubscription.key) {
    return false;
  }
  return isSubscriptionHandleActive(activeScopedSubscription.handle);
}

function applyDesiredScopedSubscription(reason: string): void {
  if (!shouldMaintainConnection) {
    return;
  }
  const currentConnection = connection;
  if (!currentConnection || !currentConnection.isActive) {
    return;
  }

  const desired = desiredScopedSubscription;
  if (!desired) {
    const hadActive = Boolean(activeScopedSubscription);
    terminateActiveScopedSubscription(`clear_desired:${reason}`);
    detachCoreTableListeners();
    clearZeroRowWatchdogTimer();
    if (hadActive) {
      publishTelemetry({ subscriptionState: 'idle', lastError: null });
      logActiveSubscriptions(null);
    }
    return;
  }

  if (
    activeScopedSubscription?.key === desired.key &&
    isSubscriptionHandleActive(activeScopedSubscription.handle)
  ) {
    attachCoreTableListeners(currentConnection.db as any, activeScopedSubscription.listenerBindings);
    return;
  }

  subscribeToScopedSpec(currentConnection, desired);
}

function activateScopedSubscription(spec: ScopedSubscriptionSpec): () => void {
  connectSpacetimeDB();
  const nextRefCount = (scopedSubscriptionRefCounts.get(spec.key) ?? 0) + 1;
  scopedSubscriptionRefCounts.set(spec.key, nextRefCount);
  desiredScopedSubscription = spec;

  if (isDesiredScopedSubscriptionActive()) {
    maybeLogVerbose('subscription_dedupe', { key: spec.key, name: spec.name });
  } else {
    applyDesiredScopedSubscription(`activate:${spec.name}`);
  }

  return () => {
    const currentRefCount = scopedSubscriptionRefCounts.get(spec.key) ?? 0;
    if (currentRefCount > 1) {
      scopedSubscriptionRefCounts.set(spec.key, currentRefCount - 1);
      return;
    }
    scopedSubscriptionRefCounts.delete(spec.key);
    if (desiredScopedSubscription?.key !== spec.key) {
      return;
    }
    desiredScopedSubscription = null;
    terminateActiveScopedSubscription(`teardown:${spec.name}`);
    detachCoreTableListeners();
    clearZeroRowWatchdogTimer();
    publishTelemetry({ subscriptionState: 'idle', lastError: null });
    logActiveSubscriptions(null);
  };
}

export function subscribeBootstrap(): () => void {
  const identityViews = IDENTITY_SUBSCRIPTION_VIEWS.filter(
    (viewName) => viewName !== 'my_conversation_messages',
  );
  const views = [
    ...PUBLIC_SUBSCRIPTION_VIEWS,
    ...identityViews,
  ];
  const fallbackViews = views.filter((viewName) => !OPTIONAL_BOOTSTRAP_VIEWS.has(viewName));
  const querySets = [buildViewSelectQueries(views)];
  if (fallbackViews.length > 0 && fallbackViews.length !== views.length) {
    querySets.push(buildViewSelectQueries(fallbackViews));
  }
  const spec = buildScopedSubscriptionSpec(
    'bootstrap',
    'bootstrap',
    views,
    querySets,
  );
  return activateScopedSubscription(spec);
}

export function subscribeAuthIdentity(): () => void {
  const views = ['my_identity', 'my_roles', 'my_profile'];
  const spec = buildScopedSubscriptionSpec(
    'auth_identity',
    'auth-identity',
    views,
    [buildViewSelectQueries(views)],
  );
  return activateScopedSubscription(spec);
}

export function subscribeFriends(): () => void {
  const views = [
    'public_profile_summary',
    'public_live_discovery',
    'my_friendships',
    'my_notifications',
    'my_conversations',
  ];
  const spec = buildScopedSubscriptionSpec(
    'friends',
    'friends',
    views,
    [buildViewSelectQueries(views)],
  );
  return activateScopedSubscription(spec);
}

export function subscribeMusicCatalog(): () => void {
  const views = ['track', 'artist', 'playlist', 'playlist_track'];
  const spec = buildScopedSubscriptionSpec(
    'music_catalog',
    'music_catalog',
    views,
    [buildViewSelectQueries(views)],
  );
  return activateScopedSubscription(spec);
}

export function subscribeGlobalChat(
  roomId: string,
  windowCursor?: SpacetimeMessageWindowCursor,
): () => void {
  const normalizedRoomId = roomId.trim();
  const keyRoom = normalizedRoomId.length > 0 ? normalizedRoomId : 'global';
  const baseViews = [
    'public_profile_summary',
    'public_live_discovery',
    'my_friendships',
    'my_notifications',
    'my_conversations',
  ];
  const allViews = baseViews;
  const baseQueries = buildViewSelectQueries(baseViews);
  const messageQueryVariants = buildMessageViewQueryVariants(
    'global_message_item',
    keyRoom,
    ['room_id'],
    windowCursor,
  );
  const querySets = messageQueryVariants.map((messageQuery) => [...baseQueries, messageQuery]);
  const spec = buildScopedSubscriptionSpec(
    'global_chat',
    `global_chat:${keyRoom}:${toWindowKey(windowCursor)}`,
    allViews,
    querySets,
  );
  return activateScopedSubscription(spec);
}

export function subscribeConversation(
  conversationId: string,
  windowCursor?: SpacetimeMessageWindowCursor,
): () => void {
  const normalizedConversationId = conversationId.trim();
  const keyConversationId = normalizedConversationId.length > 0 ? normalizedConversationId : 'unknown';
  const baseViews = [
    'public_profile_summary',
    'my_notifications',
    'my_conversations',
  ];
  const allViews = [...baseViews, 'my_conversation_messages'];
  const baseQueries = buildViewSelectQueries(baseViews);
  const messageQueryVariants = buildMessageViewQueryVariants(
    'my_conversation_messages',
    keyConversationId,
    ['conversation_id', 'conversation_key', 'other_user_id', 'room_id'],
    windowCursor,
  );
  const querySets = messageQueryVariants.map((messageQuery) => [...baseQueries, messageQuery]);
  const spec = buildScopedSubscriptionSpec(
    'conversation',
    `conversation:${keyConversationId}:${toWindowKey(windowCursor)}`,
    allViews,
    querySets,
  );
  return activateScopedSubscription(spec);
}

export function subscribeLive(liveId: string): () => void {
  const normalizedLiveId = liveId.trim();
  const keyLiveId = normalizedLiveId.length > 0 ? normalizedLiveId : 'unknown';
  const baseViews = ['public_profile_summary', 'my_friendships', 'my_notifications'];
  const allViews = [...baseViews, 'public_live_discovery', 'public_live_presence_item', 'global_message_item'];
  const baseQueries = buildViewSelectQueries(baseViews);
  const liveQueries = uniqueStrings([
    `SELECT * FROM public_live_discovery WHERE live_id = '${escapeSqlLiteral(keyLiveId)}'`,
  ]);
  const presenceQueries = uniqueStrings([
    `SELECT * FROM public_live_presence_item WHERE live_id = '${escapeSqlLiteral(keyLiveId)}'`,
    'SELECT * FROM public_live_presence_item',
  ]);
  // Room-scoped only: avoid temporal filters that can trigger parser errors on some servers.
  const liveMessageQueryVariants = [
    `SELECT * FROM global_message_item WHERE room_id = '${escapeSqlLiteral(keyLiveId)}'`,
  ];
  const querySets = liveQueries.flatMap((liveQuery) =>
    presenceQueries.flatMap((presenceQuery) =>
      liveMessageQueryVariants.map((messageQuery) => [
        ...baseQueries,
        liveQuery,
        presenceQuery,
        messageQuery,
      ]),
    ),
  );
  const spec = buildScopedSubscriptionSpec(
    'live',
    `live:${keyLiveId}`,
    allViews,
    querySets,
  );
  return activateScopedSubscription(spec);
}

function ensureConnection(): DbConnection | null {
  if (!shouldMaintainConnection) {
    return connection;
  }

  if (!connection) {
    // Connection can be requested during render paths (table reads), so avoid
    // synchronous listener fan-out here. The onConnect/onError callbacks publish.
    connectLifecycleState = 'connecting';
    telemetrySnapshot = {
      ...telemetrySnapshot,
      connectionState: 'connecting',
      updatedAt: Date.now(),
    };
    builder.withToken(authToken ?? undefined);
    connection = builder.build();
  }
  return connection;
}

async function refreshAuthTokenIfExpiringSoon(): Promise<void> {
  if (!authToken || !tokenRefreshHandler) {
    return;
  }

  const payload = parseJwtPayload(authToken);
  const expMs = typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  if (!expMs) {
    return;
  }

  const msUntilExpiry = expMs - Date.now();
  const isExpiringSoon = msUntilExpiry < 5 * 60 * 1000;
  if (!isExpiringSoon) {
    return;
  }

  maybeLogVerbose('connect_refresh_token_expiring_soon', { msUntilExpiry });
  try {
    const newToken = await tokenRefreshHandler();
    if (newToken) {
      await setSpacetimeAuthToken(newToken);
      return;
    }

    maybeLogVerbose('connect_refresh_token_unavailable', { msUntilExpiry });
    if (msUntilExpiry <= 0) {
      maybeLogVerbose('connect_refresh_token_unavailable_clearing_tokens', { msUntilExpiry });
      // Clear expired tokens
      await setSpacetimeAuthToken(null);
    }
  } catch (error) {
    maybeLogVerbose('connect_refresh_token_failed', { error: toErrorMessage(error) });
    // If refresh fails, clear tokens to force fresh sign-in
    await setSpacetimeAuthToken(null);
  }
}

function requestConnect(trigger: string): Promise<void> {
  const sessionId = connectionSessionId;
  if (connectInFlight && connectInFlight.sessionId === sessionId) {
    return connectInFlight.promise;
  }

  const promise = (async () => {
    if (!shouldMaintainConnection || sessionId !== connectionSessionId) {
      connectLifecycleState = 'idle';
      return;
    }

    if (!authLoaded) {
      connectLifecycleState = 'hydrating_auth';
      publishTelemetry({ connectionState: 'connecting' });
      await hydrateAuthState();
      if (!shouldMaintainConnection || sessionId !== connectionSessionId) {
        connectLifecycleState = 'idle';
        return;
      }
    }

    await refreshAuthTokenIfExpiringSoon();
    if (!shouldMaintainConnection || sessionId !== connectionSessionId) {
      connectLifecycleState = 'idle';
      return;
    }

    clearZeroRowWatchdogTimer();
    const current = ensureConnection();
    if (!current) {
      connectLifecycleState = 'idle';
      publishTelemetry({ connectionState: 'idle', subscriptionState: 'idle' });
      return;
    }

    connectLifecycleState = current.isActive ? 'connected' : 'connecting';
    if (current.isActive) {
      applyDesiredScopedSubscription('connect_request');
    }

    maybeLogVerbose('connect_requested', {
      trigger,
      isActive: current.isActive,
      lifecycle: connectLifecycleState,
      telemetry: {
        connectionState: telemetrySnapshot.connectionState,
        subscriptionState: telemetrySnapshot.subscriptionState,
      },
    });
  })()
    .catch((error) => {
      if (!shouldMaintainConnection || sessionId !== connectionSessionId) {
        return;
      }
      connectLifecycleState = 'idle';
      publishTelemetry({ connectionState: 'error', lastError: toErrorMessage(error) });
      scheduleReconnect(`connect_flow_failed:${trigger}`);
    })
    .finally(() => {
      if (connectInFlight?.promise === promise) {
        connectInFlight = null;
      }
    });

  connectInFlight = { sessionId, promise };
  return promise;
}

const builder = DbConnection.builder()
  .withUri(SPACETIMEDB_URI)
  .withDatabaseName(SPACETIMEDB_DB_NAME)
  // Hermes (React Native) does not provide DecompressionStream.
  .withCompression('none')
  .onConnect((nextConnection, _identity, _token) => {
    const nextToken = isLikelyJwtToken(authToken) ? authToken : null;
    const claimedUserId = readJwtSubject(nextToken);
    setAuthState({
      userId: claimedUserId ?? null,
      token: nextToken,
    });
    persistAuthToken(nextToken);

    reconnectAttempts = 0;
    pendingReconnectReason = null;
    connectLifecycleState = 'connected';
    clearReconnectTimer();
    clearZeroRowWatchdogTimer();
    publishTelemetry({ connectionState: 'connected', lastError: null });
    console.log(
      `[SpacetimeDB] Connected! uri=${SPACETIMEDB_URI} database=${SPACETIMEDB_DB_NAME}`,
    );
    void resolveDatabaseIdentity();
    applyDesiredScopedSubscription('connect');
  })
  .onConnectError((_ctx, err) => {
    connectLifecycleState = 'idle';
    const errorMessage = toErrorMessage(err);
    const isTokenError = errorMessage.toLowerCase().includes('token');
    publishTelemetry({
      connectionState: 'error',
      subscriptionState: 'idle',
      lastError: errorMessage,
    });
    if (isTokenError) {
      console.warn('[SpacetimeDB] Connection token rejected. Attempting recovery...', errorMessage);
    } else {
      console.error('[SpacetimeDB] Connection Error:', err);
    }

    const handleTokenError = async () => {
      if (tokenRefreshHandler) {
        console.log('[SpacetimeDB] Connection failed with token error. Attempting refresh...');
        try {
          const newToken = await tokenRefreshHandler();
          if (newToken) {
            await setSpacetimeAuthToken(newToken);
            scheduleReconnect('token_refreshed_after_error');
            return;
          }
          console.warn(
            '[SpacetimeDB] Refresh token is unavailable or invalid. Clearing invalid tokens and requiring fresh sign-in.',
          );
          // Clear invalid tokens and reset auth state
          await setSpacetimeAuthToken(null);
          publishTelemetry({
            connectionState: 'error',
            subscriptionState: 'idle',
            lastError: 'auth_signin_required',
          });
          return;
        } catch (e) {
          console.warn(
            '[SpacetimeDB] Token refresh failed temporarily. Retrying without clearing session.',
            e,
          );
          scheduleReconnect('token_refresh_retry');
          return;
        }
      }
      console.warn(
        '[SpacetimeDB] Token error without refresh handler. Clearing tokens and requiring fresh sign-in.',
      );
      // Clear invalid tokens and reset auth state
      await setSpacetimeAuthToken(null);
      publishTelemetry({
        connectionState: 'error',
        subscriptionState: 'idle',
        lastError: 'auth_signin_required',
      });
    };

    if (isTokenError) {
      void handleTokenError();
    } else {
      scheduleReconnect('connect_error');
    }

    terminateActiveScopedSubscription('connect_error');
    clearZeroRowWatchdogTimer();
    detachCoreTableListeners();
    logActiveSubscriptions(null);
    connection = null;
  })
  .onDisconnect(() => {
    const forcedReconnectReason = pendingForcedReconnectReason;
    pendingForcedReconnectReason = null;
    connectLifecycleState = 'idle';
    publishTelemetry({ connectionState: 'disconnected', subscriptionState: 'idle' });
    console.log('[SpacetimeDB] Disconnected.');
    terminateActiveScopedSubscription('disconnect');
    clearZeroRowWatchdogTimer();
    detachCoreTableListeners();
    logActiveSubscriptions(null);
    connection = null;
    if (forcedReconnectReason && shouldMaintainConnection) {
      publishTelemetry({ connectionState: 'connecting', subscriptionState: 'idle' });
      maybeLogVerbose('forced_reconnect_scheduled', { reason: forcedReconnectReason });
      scheduleReconnect(`forced_reconnect:${forcedReconnectReason}`);
      return;
    }
    scheduleReconnect('disconnect');
  });

export const spacetimeDb = {
  get db() {
    return connection?.db ?? EMPTY_DB_VIEW;
  },
  get reducers() {
    return connection?.reducers ?? EMPTY_REDUCERS;
  },
  get procedures() {
    return (connection as any)?.procedures ?? EMPTY_PROCEDURES;
  },
  get isActive() {
    return connection?.isActive || false;
  },
};

export const connectSpacetimeDB = () => {
  const nextSession = !shouldMaintainConnection;
  shouldMaintainConnection = true;
  if (nextSession) {
    // Increment to invalidate stale async connect work from older sessions.
    connectionSessionId += 1;
    sessionRecoveryAttempts = 0;
    reconnectAttempts = 0;
    pendingReconnectReason = null;
  }
  void requestConnect(nextSession ? 'session_start' : 'external_request');
};

export type SpacetimeProfileAnnouncement = {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  statusText?: string | null;
};

const announcedProfileFingerprintByUserId = new Map<string, string>();

function normalizeProfileValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function announceSpacetimeUserProfile(
  announcement: SpacetimeProfileAnnouncement,
): Promise<void> {
  const userId = normalizeProfileValue(announcement.userId);
  if (!userId) return;

  const username = normalizeProfileValue(announcement.username || announcement.displayName) || userId;
  const displayName =
    normalizeProfileValue(announcement.displayName || announcement.username) || username;
  const avatarUrl = normalizeProfileValue(announcement.avatarUrl);
  const statusText = normalizeProfileValue(announcement.statusText);

  const fingerprint = JSON.stringify([userId, username, displayName, avatarUrl, statusText]);
  if (announcedProfileFingerprintByUserId.get(userId) === fingerprint) {
    return;
  }

  const reducers = spacetimeDb.reducers as any;
  const profilePayload = JSON.stringify({
    eventType: 'user_profile',
    userId,
    username,
    displayName,
    avatarUrl,
    statusText,
    createdAt: Date.now(),
  });

  if (typeof reducers?.createUserProfile === 'function') {
    await reducers.createUserProfile({
      userId,
      profile: profilePayload,
    });
  } else if (typeof reducers?.sendGlobalMessage === 'function') {
    await reducers.sendGlobalMessage({
      id: `profile-${userId}-${Date.now()}`,
      roomId: `profile:${userId}`,
      item: profilePayload,
    });
  } else {
    throw new Error('SpacetimeDB reducers are unavailable.');
  }

  announcedProfileFingerprintByUserId.set(userId, fingerprint);
}

export type SpacetimeProfileViewTrackRequest = {
  viewerUserId: string;
  profileUserId: string;
  openedAtMs?: number;
  source?: string;
  dedupeWindowMs?: number;
};

export async function trackSpacetimeProfileView(
  request: SpacetimeProfileViewTrackRequest,
): Promise<void> {
  const viewerUserId = normalizeProfileValue(request.viewerUserId);
  const profileUserId = normalizeProfileValue(request.profileUserId);
  if (!viewerUserId || !profileUserId) {
    return;
  }

  const openedAtMs = Math.max(0, Math.floor(request.openedAtMs ?? Date.now()));
  const reducers = spacetimeDb.reducers as any;
  if (typeof reducers?.trackProfileView !== 'function') {
    return;
  }

  const eventId = [
    'profile-view-v2',
    encodeURIComponent(viewerUserId),
    encodeURIComponent(profileUserId),
    String(openedAtMs),
  ].join('::');

  await reducers.trackProfileView({
    id: eventId,
    viewerUserId,
    profileUserId,
    occurredAtMs: String(openedAtMs),
    source: normalizeProfileValue(request.source) || 'profile_modal_open',
    dedupeWindowMs:
      typeof request.dedupeWindowMs === 'number' && Number.isFinite(request.dedupeWindowMs)
        ? Math.max(0, Math.floor(request.dedupeWindowMs))
        : undefined,
  });
}

export const disconnectSpacetimeDB = () => {
  shouldMaintainConnection = false;
  connectionSessionId += 1;
  scopedSubscriptionAttemptNonce += 1;
  connectLifecycleState = 'disconnecting';
  connectInFlight = null;
  desiredScopedSubscription = null;
  scopedSubscriptionRefCounts.clear();
  pendingForcedReconnectReason = null;
  pendingReconnectReason = null;
  reconnectAttempts = 0;
  subscriptionRetryAttempts = 0;
  sessionRecoveryAttempts = 0;
  clearReconnectTimer();
  clearZeroRowWatchdogTimer();
  const currentConnection = connection;
  connection = null;
  terminateActiveScopedSubscription('manual_disconnect');
  detachCoreTableListeners();
  publishTelemetry({ connectionState: 'disconnected', subscriptionState: 'idle' });
  logActiveSubscriptions(null);
  if (currentConnection) {
    currentConnection.disconnect();
  }
  connectLifecycleState = 'idle';
  maybeLogVerbose('disconnect_requested');
};

export async function signOutSpacetimeAuth(): Promise<void> {
  disconnectSpacetimeDB();
  await setSpacetimeAuthToken(null);
}

export function logSpacetimeDebugSnapshot(label = 'manual'): void {
  const dbView = connection?.db as any;
  const snapshot = {
    label,
    uri: SPACETIMEDB_URI,
    database: SPACETIMEDB_DB_NAME,
    isConnectionActive: connection?.isActive ?? false,
    activeSubscriptionKey: activeScopedSubscription?.key ?? null,
    activeSubscriptionName: activeScopedSubscription?.name ?? null,
    activeSubscriptionViews: activeScopedSubscription?.views ?? [],
    isSubscriptionActive: isSubscriptionHandleActive(activeScopedSubscription?.handle),
    isSubscriptionEnded: activeScopedSubscription?.handle
      ? !isSubscriptionHandleActive(activeScopedSubscription?.handle)
      : true,
    telemetry: telemetrySnapshot,
    coreRowCounts: readCoreRowCounts(dbView),
  };

  console.log('[SpacetimeDB][debug_snapshot]', snapshot);
}

function normalizeSpacetimeViewName(viewName: string): string {
  return viewName.trim().toLowerCase();
}

function subscriptionIncludesView(
  subscription: Pick<ActiveScopedSubscription, 'views'> | Pick<ScopedSubscriptionSpec, 'views'> | null,
  viewName: string,
): boolean {
  if (!subscription) {
    return false;
  }
  const normalizedViewName = normalizeSpacetimeViewName(viewName);
  if (!normalizedViewName) {
    return false;
  }
  return subscription.views.some(
    (candidateViewName) =>
      normalizeSpacetimeViewName(candidateViewName) === normalizedViewName,
  );
}

export function isSpacetimeViewRequested(viewName: string): boolean {
  return (
    subscriptionIncludesView(desiredScopedSubscription, viewName) ||
    subscriptionIncludesView(activeScopedSubscription, viewName)
  );
}

export function isSpacetimeViewActive(viewName: string): boolean {
  if (!activeScopedSubscription) {
    return false;
  }
  if (!isSubscriptionHandleActive(activeScopedSubscription.handle)) {
    return false;
  }
  return subscriptionIncludesView(activeScopedSubscription, viewName);
}
