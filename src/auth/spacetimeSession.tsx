import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClerkProvider, useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import Constants from 'expo-constants';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  secureStoreDeleteItem,
  secureStoreGetItem,
  secureStoreSetItem,
} from '../utils/secureStoreCompat';
import { resolveClerkPublishableKey } from './clerkConfig';

import {
  connectSpacetimeDB,
  disconnectSpacetimeDB,
  getSpacetimeTelemetrySnapshot,
  setSpacetimeAuthToken,
  setTokenRefreshHandler,
  signOutSpacetimeAuth,
  spacetimeDb,
  subscribeAuthIdentity,
  subscribeSpacetimeDataChanges,
  subscribeSpacetimeTelemetry,
} from '../lib/spacetime';

const CLERK_PUBLISHABLE_KEY = resolveClerkPublishableKey({
  env: process.env,
  expoExtra: Constants.expoConfig?.extra ?? null,
});
const VULU_SESSION_CACHE_KEY = 'vulu.auth.session';
const LEGACY_SPACETIME_AUTH_TOKEN_STORAGE_KEY = 'spacetimedb.auth_token';
const LEGACY_SPACETIME_REFRESH_TOKEN_STORAGE_KEY = 'spacetimedb.auth_refresh_token';
const SESSION_SYNC_TIMEOUT_MS = 20_000;
const SESSION_SYNC_POLL_MS = 160;
const SESSION_SYNC_RETRY_BASE_MS = 1_200;
const SESSION_SYNC_RETRY_MAX_MS = 12_000;
const CLERK_PROVIDER = 'clerk';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type SessionEmailAddress = {
  emailAddress: string;
};

type SessionPhoneNumber = {
  phoneNumber: string;
};

type SessionUser = {
  id: string;
  username: string | null;
  fullName: string | null;
  imageUrl: string | null;
  primaryEmailAddress: SessionEmailAddress | null;
  emailAddresses: SessionEmailAddress[];
  primaryPhoneNumber: SessionPhoneNumber | null;
  delete: () => Promise<void>;
};

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  return normalizeString((metadata as Record<string, unknown>)[key]);
}

type CachedVuluSession = {
  clerkUserId: string;
  issuer: string | null;
  subject: string | null;
  vuluUserId: string;
  emailAddress: string | null;
  roles: string[];
};

type SessionStatus = 'loading' | 'signed_out' | 'needs_verification' | 'syncing' | 'ready';

type SessionContextValue = {
  isLoaded: boolean;
  hasSession: boolean;
  isSignedIn: boolean;
  needsVerification: boolean;
  status: SessionStatus;
  userId: string | null;
  clerkUserId: string | null;
  emailAddress: string | null;
  emailVerified: boolean;
  roles: string[];
  sessionUser: SessionUser | null;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
  syncError: string | null;
  syncErrorIsBlocking: boolean;
};

type JwtClaims = Record<string, unknown>;

type IdentityRow = {
  id?: string;
  vuluUserId?: string;
  vulu_user_id?: string;
  provider?: string;
  issuer?: string;
  subject?: string;
  email?: string | null;
  emailVerified?: boolean;
  email_verified?: boolean;
};

type RoleRow = {
  role?: string;
};

type ReducerResponse = {
  vuluUserId?: string;
  vulu_user_id?: string;
};

type ResolveIdentityProcedureResponse =
  | string
  | {
    vuluUserId?: string;
    vulu_user_id?: string;
  };

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const defaultSessionValue: SessionContextValue = {
  isLoaded: false,
  hasSession: false,
  isSignedIn: false,
  needsVerification: false,
  status: 'loading',
  userId: null,
  clerkUserId: null,
  emailAddress: null,
  emailVerified: false,
  roles: [],
  sessionUser: null,
  getToken: async () => null,
  signOut: async () => { },
  syncError: null,
  syncErrorIsBlocking: false,
};

let externalSignOutHandler: (() => Promise<void>) | null = null;

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function decodeBase64UrlUtf8(base64Url: string): string | null {
  const normalized = normalizeString(base64Url);
  if (!normalized) return null;

  const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (let index = 0; index < padded.length; index += 1) {
    const char = padded[index];
    if (!char || char === '=') {
      break;
    }
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) {
      return null;
    }
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
      // Fall through to the percent-encoding fallback.
    }
  }

  try {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const encoded = binary
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('');
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function parseJwtClaims(token: string | null): JwtClaims | null {
  const normalized = normalizeString(token);
  if (!normalized) return null;

  const parts = normalized.split('.');
  if (parts.length !== 3) return null;

  const payload = decodeBase64UrlUtf8(parts[1] ?? '');
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as JwtClaims;
    }
  } catch {
    // Ignore malformed payloads.
  }

  return null;
}

function readClaimString(claims: JwtClaims | null, key: string): string | null {
  if (!claims) return null;
  return normalizeString(claims[key]);
}

function readClaimBoolean(claims: JwtClaims | null, key: string): boolean | null {
  if (!claims) return null;
  const value = claims[key];
  return typeof value === 'boolean' ? value : null;
}

async function readCachedSession(): Promise<CachedVuluSession | null> {
  try {
    const raw = await secureStoreGetItem(VULU_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedVuluSession>;
    const clerkUserId = normalizeString(parsed.clerkUserId);
    const vuluUserId = normalizeString(parsed.vuluUserId);
    if (!clerkUserId || !vuluUserId) {
      return null;
    }
    return {
      clerkUserId,
      issuer: normalizeString(parsed.issuer),
      subject: normalizeString(parsed.subject),
      vuluUserId,
      emailAddress: normalizeString(parsed.emailAddress),
      roles: normalizeRoles(parsed.roles),
    };
  } catch {
    return null;
  }
}

async function writeCachedSession(nextSession: CachedVuluSession): Promise<void> {
  await secureStoreSetItem(VULU_SESSION_CACHE_KEY, JSON.stringify(nextSession));
}

async function clearCachedSession(): Promise<void> {
  await secureStoreDeleteItem(VULU_SESSION_CACHE_KEY);
}

async function clearLegacySpacetimeStorage(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(LEGACY_SPACETIME_AUTH_TOKEN_STORAGE_KEY),
      AsyncStorage.removeItem(LEGACY_SPACETIME_REFRESH_TOKEN_STORAGE_KEY),
    ]);
  } catch {
    // Best-effort cleanup for the removed auth stack.
  }
}

function buildSessionUser(
  user: any,
  signOut: () => Promise<void>,
): SessionUser | null {
  if (!user) return null;

  const primaryEmailAddress = normalizeString(user.primaryEmailAddress?.emailAddress);
  const phoneNumber = normalizeString(user.primaryPhoneNumber?.phoneNumber);
  const emailAddresses = Array.isArray(user.emailAddresses)
    ? user.emailAddresses
      .map((entry: any) => normalizeString(entry?.emailAddress))
      .filter((entry: string | null): entry is string => Boolean(entry))
      .map((emailAddress: string) => ({ emailAddress }))
    : primaryEmailAddress
      ? [{ emailAddress: primaryEmailAddress }]
      : [];

  const metadataUsername =
    readMetadataString(user.unsafeMetadata, 'username') ??
    readMetadataString(user.publicMetadata, 'username');
  const firstName = normalizeString(user.firstName);
  const lastName = normalizeString(user.lastName);
  const metadataDisplayName =
    readMetadataString(user.unsafeMetadata, 'displayName') ??
    readMetadataString(user.publicMetadata, 'displayName');
  const derivedFullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    id: normalizeString(user.id) ?? '',
    username: normalizeString(user.username) ?? metadataUsername,
    fullName:
      normalizeString(user.fullName) ??
      (derivedFullName.length > 0 ? derivedFullName : null) ??
      metadataDisplayName,
    imageUrl: normalizeString(user.imageUrl),
    primaryEmailAddress: primaryEmailAddress ? { emailAddress: primaryEmailAddress } : null,
    emailAddresses,
    primaryPhoneNumber: phoneNumber ? { phoneNumber } : null,
    delete: signOut,
  };
}

function readPrimaryEmailAddress(user: any): string | null {
  const primary = normalizeString(user?.primaryEmailAddress?.emailAddress);
  if (primary) return primary;

  if (Array.isArray(user?.emailAddresses)) {
    for (const entry of user.emailAddresses) {
      const emailAddress = normalizeString(entry?.emailAddress);
      if (emailAddress) {
        return emailAddress;
      }
    }
  }

  return null;
}

function readEmailVerified(user: any): boolean {
  if (user?.primaryEmailAddress?.verification?.status === 'verified') {
    return true;
  }

  if (Array.isArray(user?.emailAddresses)) {
    return user.emailAddresses.some(
      (entry: any) => entry?.verification?.status === 'verified',
    );
  }

  return false;
}

function readIdentityRows(): IdentityRow[] {
  const dbView = spacetimeDb.db as Record<string, unknown>;
  const table =
    (dbView.myIdentity as { iter?: () => Iterable<IdentityRow> } | undefined) ??
    (dbView.my_identity as { iter?: () => Iterable<IdentityRow> } | undefined);

  if (!table || typeof table.iter !== 'function') {
    return [];
  }

  return Array.from(table.iter());
}

function readRoleNames(): string[] {
  const dbView = spacetimeDb.db as Record<string, unknown>;
  const table =
    (dbView.myRoles as { iter?: () => Iterable<RoleRow> } | undefined) ??
    (dbView.my_roles as { iter?: () => Iterable<RoleRow> } | undefined);

  if (!table || typeof table.iter !== 'function') {
    return [];
  }

  return Array.from(
    new Set(
      Array.from(table.iter())
        .map((row) => normalizeString(row.role))
        .filter((role): role is string => Boolean(role)),
    ),
  );
}

function findIdentityRow(issuer: string, subject: string): IdentityRow | null {
  const rows = readIdentityRows();
  return (
    rows.find((row) => row.issuer === issuer && row.subject === subject) ??
    rows[0] ??
    null
  );
}

function readIdentityVuluUserId(row: IdentityRow | null): string | null {
  if (!row) return null;
  return normalizeString(row.vuluUserId) ?? normalizeString(row.vulu_user_id);
}

async function resolveIdentityViaProcedure(args: {
  provider: string;
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
}): Promise<{ available: boolean; vuluUserId: string | null }> {
  const procedures = (spacetimeDb as Record<string, unknown>).procedures as
    | Record<string, unknown>
    | undefined;
  const procedure = procedures?.resolveOrCreateUserIdentitySync;

  if (typeof procedure !== 'function') {
    return { available: false, vuluUserId: null };
  }

  let response: ResolveIdentityProcedureResponse;
  try {
    response = await (procedure as (params: typeof args) => Promise<ResolveIdentityProcedureResponse>)(args);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const normalized = message.trim().toLowerCase();
    if (
      normalized.includes('no such procedure') ||
      normalized.includes('unknown procedure')
    ) {
      return { available: false, vuluUserId: null };
    }
    throw error;
  }

  const vuluUserId = normalizeString(
    typeof response === 'string'
      ? response
      : response?.vuluUserId ?? response?.vulu_user_id,
  );

  return {
    available: true,
    vuluUserId,
  };
}

async function waitForSpacetimeConnection(timeoutMs = SESSION_SYNC_TIMEOUT_MS): Promise<void> {
  const initial = getSpacetimeTelemetrySnapshot();
  if (initial.connectionState === 'connected') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out while waiting for SpacetimeDB to connect.'));
    }, timeoutMs);

    const unsubscribe = subscribeSpacetimeTelemetry((snapshot) => {
      if (snapshot.connectionState === 'connected') {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      } else if (snapshot.connectionState === 'error' && snapshot.lastError) {
        clearTimeout(timeout);
        unsubscribe();
        reject(new Error(snapshot.lastError));
      }
    });
  });
}

async function waitForResolvedIdentity(
  issuer: string,
  subject: string,
  timeoutMs = SESSION_SYNC_TIMEOUT_MS,
): Promise<IdentityRow> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const matched = findIdentityRow(issuer, subject);
    if (matched && readIdentityVuluUserId(matched)) {
      return matched;
    }

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, SESSION_SYNC_POLL_MS);
      const unsubscribe = subscribeSpacetimeDataChanges((event) => {
        if (!event.scopes.includes('identity')) {
          return;
        }
        clearTimeout(timer);
        unsubscribe();
        resolve(null);
      });
    });
  }

  throw new Error('Timed out while waiting for the vulu_user_id mapping.');
}

async function clearLocalSessionArtifacts(): Promise<void> {
  await clearCachedSession();
  await clearLegacySpacetimeStorage();
  await signOutSpacetimeAuth();
}

function formatSessionSyncError(error: unknown): { message: string; blocking: boolean } {
  const rawMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : typeof error === 'string' && error.trim().length > 0
        ? error.trim()
        : 'Failed to sync the authenticated Vulu session.';

  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes('no such reducer') ||
    normalized.includes('no such view') ||
    normalized.includes('unknown reducer')
  ) {
    return {
      message:
        'The deployed SpacetimeDB module is missing the new auth reducers/views. Publish the updated module, then retry login.',
      blocking: true,
    };
  }

  return {
    message: rawMessage,
    blocking: false,
  };
}

export async function clearSpacetimeAuthSession(): Promise<void> {
  if (externalSignOutHandler) {
    await externalSignOutHandler();
    return;
  }

  await clearLocalSessionArtifacts();
}

function SessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded: isAuthLoaded, isSignedIn: clerkHasSession, getToken: clerkGetToken, signOut: clerkSignOut } =
    useClerkAuth();
  const { isLoaded: isUserLoaded, user } = useClerkUser();
  const syncAttemptRef = useRef(0);
  const syncRetryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authIdentitySubscriptionRef = useRef<(() => void) | null>(null);
  const expectedIdentityRef = useRef<{
    clerkUserId: string;
    issuer: string;
    subject: string;
    emailAddress: string | null;
  } | null>(null);
  const [syncNonce, setSyncNonce] = useState(0);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [vuluUserId, setVuluUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorIsBlocking, setSyncErrorIsBlocking] = useState(false);

  const clerkUserId = normalizeString(user?.id);
  const emailAddress = readPrimaryEmailAddress(user);
  const emailVerified = readEmailVerified(user);
  const hasSession = Boolean(clerkHasSession);
  const sessionUser = useMemo(
    () =>
      buildSessionUser(user, async () => {
        await clearSpacetimeAuthSession();
      }),
    [user],
  );

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const bumpSyncNonce = useCallback(() => {
    syncAttemptRef.current += 1;
    setSyncNonce((current) => current + 1);
  }, []);

  const clearAuthIdentitySubscription = useCallback(() => {
    if (!authIdentitySubscriptionRef.current) {
      return;
    }

    authIdentitySubscriptionRef.current();
    authIdentitySubscriptionRef.current = null;
  }, []);

  const getToken = useCallback(
    async (options?: { template?: string }) => {
      if (!isAuthLoaded || !clerkHasSession) {
        return null;
      }

      try {
        return await clerkGetToken(options);
      } catch {
        return null;
      }
    },
    [clerkGetToken, clerkHasSession, isAuthLoaded],
  );

  const applyCachedSession = useCallback(
    (cached: CachedVuluSession | null) => {
      if (!cached || !clerkUserId || cached.clerkUserId !== clerkUserId) {
        return false;
      }

      setSyncError(null);
      setSyncErrorIsBlocking(false);
      return true;
    },
    [clerkUserId],
  );

  const commitResolvedIdentity = useCallback((nextVuluUserId: string) => {
    const nextRoles = readRoleNames();
    const expectedIdentity = expectedIdentityRef.current;

    syncRetryCountRef.current = 0;
    setVuluUserId((currentUserId) =>
      currentUserId === nextVuluUserId ? currentUserId : nextVuluUserId,
    );
    setRoles((currentRoles) => {
      const currentKey = currentRoles.join('|');
      const nextKey = nextRoles.join('|');
      return currentKey === nextKey ? currentRoles : nextRoles;
    });
    setSyncError(null);
    setSyncErrorIsBlocking(false);
    setStatus((currentStatus) => (currentStatus === 'ready' ? currentStatus : 'ready'));

    if (!expectedIdentity || expectedIdentity.clerkUserId !== clerkUserId) {
      return;
    }

    const nextCache: CachedVuluSession = {
      clerkUserId: expectedIdentity.clerkUserId,
      issuer: expectedIdentity.issuer,
      subject: expectedIdentity.subject,
      vuluUserId: nextVuluUserId,
      emailAddress: expectedIdentity.emailAddress,
      roles: nextRoles,
    };

    void writeCachedSession(nextCache);
    void clearLegacySpacetimeStorage();
  }, [clerkUserId]);

  const scheduleSyncRetry = useCallback(() => {
    if (retryTimerRef.current || !isAuthLoaded || !clerkHasSession || !emailVerified) {
      return;
    }

    const delayMs = Math.min(
      SESSION_SYNC_RETRY_MAX_MS,
      SESSION_SYNC_RETRY_BASE_MS * 2 ** syncRetryCountRef.current,
    );
    syncRetryCountRef.current = Math.min(syncRetryCountRef.current + 1, 6);

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      bumpSyncNonce();
      setStatus((currentStatus) => (currentStatus === 'ready' ? currentStatus : 'syncing'));
    }, delayMs);
  }, [bumpSyncNonce, clerkHasSession, emailVerified, isAuthLoaded]);

  const signOut = useCallback(async () => {
    clearRetryTimer();
    clearAuthIdentitySubscription();
    expectedIdentityRef.current = null;
    bumpSyncNonce();
    syncRetryCountRef.current = 0;
    setStatus('loading');
    setSyncError(null);
    setSyncErrorIsBlocking(false);
    setVuluUserId(null);
    setRoles([]);

    try {
      if (isAuthLoaded) {
        await clerkSignOut();
      }
    } finally {
      await clearLocalSessionArtifacts();
      setStatus('signed_out');
    }
  }, [bumpSyncNonce, clearAuthIdentitySubscription, clearRetryTimer, clerkSignOut, isAuthLoaded]);

  useEffect(() => {
    externalSignOutHandler = signOut;
    return () => {
      if (externalSignOutHandler === signOut) {
        externalSignOutHandler = null;
      }
    };
  }, [signOut]);

  useEffect(() => {
    setTokenRefreshHandler(async () => {
      if (!isAuthLoaded || !clerkHasSession || !emailVerified) {
        return null;
      }

      try {
        return await clerkGetToken();
      } catch {
        return null;
      }
    });

    return () => {
      setTokenRefreshHandler(null);
    };
  }, [clerkGetToken, clerkHasSession, emailVerified, isAuthLoaded]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded) {
      setStatus('loading');
      return;
    }

    clearRetryTimer();
    syncRetryCountRef.current = 0;

    if (!clerkHasSession) {
      clearAuthIdentitySubscription();
      expectedIdentityRef.current = null;
      bumpSyncNonce();
      setVuluUserId(null);
      setRoles([]);
      setSyncError(null);
      setSyncErrorIsBlocking(false);
      setStatus('signed_out');
      void clearLocalSessionArtifacts();
      return;
    }

    if (!emailVerified) {
      clearAuthIdentitySubscription();
      expectedIdentityRef.current = null;
      bumpSyncNonce();
      setVuluUserId(null);
      setRoles([]);
      setSyncError(null);
      setSyncErrorIsBlocking(false);
      setStatus('needs_verification');
      disconnectSpacetimeDB();
      void setSpacetimeAuthToken(null);
      return;
    }

    void (async () => {
      const cached = await readCachedSession();
      applyCachedSession(cached);
    })();

    setStatus((currentStatus) => (currentStatus === 'ready' ? currentStatus : 'syncing'));
  }, [
    applyCachedSession,
    clearAuthIdentitySubscription,
    clearRetryTimer,
    clerkHasSession,
    emailVerified,
    isAuthLoaded,
    isUserLoaded,
    bumpSyncNonce,
  ]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded || !clerkHasSession || !emailVerified || !clerkUserId) {
      return;
    }

    let cancelled = false;
    const attempt = syncAttemptRef.current;

    const runSync = async () => {
      clearRetryTimer();
      setStatus((currentStatus) => (currentStatus === 'ready' ? currentStatus : 'syncing'));

      try {
        const token = await clerkGetToken();
        if (!token) {
          throw new Error('Clerk session is active, but no JWT was returned.');
        }

        const claims = parseJwtClaims(token);
        const issuer = readClaimString(claims, 'iss');
        const subject = readClaimString(claims, 'sub') ?? clerkUserId;
        const normalizedEmail = readClaimString(claims, 'email') ?? emailAddress;
        const jwtEmailVerified = readClaimBoolean(claims, 'email_verified');

        if (!issuer || !subject) {
          throw new Error('Clerk JWT is missing iss/sub claims.');
        }

        expectedIdentityRef.current = {
          clerkUserId,
          issuer,
          subject,
          emailAddress: normalizedEmail,
        };

        await setSpacetimeAuthToken(token);
        if (!authIdentitySubscriptionRef.current) {
          authIdentitySubscriptionRef.current = subscribeAuthIdentity();
        }
        connectSpacetimeDB();
        await waitForSpacetimeConnection();

        const procedureResolution = await resolveIdentityViaProcedure({
          provider: CLERK_PROVIDER,
          issuer,
          subject,
          email: normalizedEmail,
          emailVerified: jwtEmailVerified ?? emailVerified,
        });

        if (procedureResolution.available) {
          if (!procedureResolution.vuluUserId) {
            throw new Error(
              'SpacetimeDB identity procedure completed without returning a vulu_user_id.',
            );
          }

          if (cancelled || attempt !== syncAttemptRef.current) {
            return;
          }

          commitResolvedIdentity(procedureResolution.vuluUserId);
          return;
        }

        const reducers = spacetimeDb.reducers as Record<string, any>;
        const reducer = reducers.resolveOrCreateUserIdentity;
        if (typeof reducer !== 'function') {
          throw new Error('SpacetimeDB auth reducers are unavailable in the generated client.');
        }

        const reducerResponse = (await reducer({
          provider: CLERK_PROVIDER,
          issuer,
          subject,
          email: normalizedEmail,
          emailVerified: jwtEmailVerified ?? emailVerified,
        })) as ReducerResponse | string | undefined;

        const reducerUserId =
          normalizeString(
            typeof reducerResponse === 'string'
              ? reducerResponse
              : reducerResponse?.vuluUserId ?? reducerResponse?.vulu_user_id,
          ) ?? null;

        const identityRow = reducerUserId
          ? ({ vuluUserId: reducerUserId } as IdentityRow)
          : await waitForResolvedIdentity(issuer, subject);
        const nextVuluUserId = readIdentityVuluUserId(identityRow);

        if (!nextVuluUserId) {
          throw new Error('SpacetimeDB did not return a vulu_user_id.');
        }

        if (cancelled || attempt !== syncAttemptRef.current) {
          return;
        }

        // Clerk identities are only inputs to the mapper; every app record keys off vulu_user_id.
        commitResolvedIdentity(nextVuluUserId);
      } catch (error) {
        if (cancelled || attempt !== syncAttemptRef.current) {
          return;
        }

        const liveExpectedIdentity = expectedIdentityRef.current;
        if (liveExpectedIdentity) {
          const liveIdentity = findIdentityRow(
            liveExpectedIdentity.issuer,
            liveExpectedIdentity.subject,
          );
          const liveVuluUserId = readIdentityVuluUserId(liveIdentity);
          if (liveVuluUserId) {
            commitResolvedIdentity(liveVuluUserId);
            return;
          }
        }

        const formatted = formatSessionSyncError(error);
        setSyncError(formatted.message);
        setSyncErrorIsBlocking(formatted.blocking);
        setStatus('syncing');
        if (!formatted.blocking) {
          scheduleSyncRetry();
        }
      }
    };

    void runSync();

    return () => {
      cancelled = true;
    };
  }, [
    clerkGetToken,
    clerkHasSession,
    clerkUserId,
    clearRetryTimer,
    emailAddress,
    emailVerified,
    isAuthLoaded,
    isUserLoaded,
    scheduleSyncRetry,
    syncNonce,
    commitResolvedIdentity,
  ]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded || !clerkHasSession || !emailVerified) {
      return;
    }

    const syncFromTables = () => {
      const expectedIdentity = expectedIdentityRef.current;
      if (!expectedIdentity) {
        return;
      }

      const nextIdentity = findIdentityRow(expectedIdentity.issuer, expectedIdentity.subject);
      const nextVuluUserId = readIdentityVuluUserId(nextIdentity);
      if (nextVuluUserId) {
        commitResolvedIdentity(nextVuluUserId);
      }
    };

    syncFromTables();

    const unsubscribeData = subscribeSpacetimeDataChanges((event) => {
      if (event.scopes.includes('identity') || event.scopes.includes('roles')) {
        syncFromTables();
      }
    });

    const unsubscribeTelemetry = subscribeSpacetimeTelemetry((snapshot) => {
      if (
        snapshot.connectionState === 'connected' &&
        (snapshot.subscriptionState === 'active' || snapshot.subscriptionState === 'subscribing')
      ) {
        syncFromTables();
      }
    });

    return () => {
      unsubscribeData();
      unsubscribeTelemetry();
    };
  }, [clerkHasSession, emailVerified, isAuthLoaded, isUserLoaded, commitResolvedIdentity]);

  useEffect(
    () => () => {
      clearRetryTimer();
      clearAuthIdentitySubscription();
    },
    [clearAuthIdentitySubscription, clearRetryTimer],
  );

  const isLoaded = isAuthLoaded && isUserLoaded;
  const isSignedIn = Boolean(hasSession && emailVerified && vuluUserId && status === 'ready');
  const needsVerification = Boolean(hasSession && !emailVerified);

  const value = useMemo<SessionContextValue>(
    () => ({
      isLoaded,
      hasSession,
      isSignedIn,
      needsVerification,
      status,
      userId: vuluUserId,
      clerkUserId,
      emailAddress,
      emailVerified,
      roles,
      sessionUser,
      getToken,
      signOut,
      syncError,
      syncErrorIsBlocking,
    }),
    [
      clerkUserId,
      emailAddress,
      emailVerified,
      getToken,
      hasSession,
      isLoaded,
      isSignedIn,
      needsVerification,
      roles,
      sessionUser,
      signOut,
      status,
      syncError,
      syncErrorIsBlocking,
      vuluUserId,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SpacetimeAuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Clerk publishable key. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.',
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <SessionBridge>{children}</SessionBridge>
    </ClerkProvider>
  );
}

function useSessionContext(): SessionContextValue {
  return useContext(SessionContext) ?? defaultSessionValue;
}

export function useAuth() {
  const session = useSessionContext();

  return {
    isLoaded: session.isLoaded,
    isSignedIn: session.isSignedIn,
    hasSession: session.hasSession,
    needsVerification: session.needsVerification,
    status: session.status,
    userId: session.userId,
    clerkUserId: session.clerkUserId,
    emailAddress: session.emailAddress,
    emailVerified: session.emailVerified,
    roles: session.roles,
    getToken: session.getToken,
    signOut: session.signOut,
    syncError: session.syncError,
    syncErrorIsBlocking: session.syncErrorIsBlocking,
  };
}

export function useUser(): { user: SessionUser | null; isLoaded: boolean } {
  const session = useSessionContext();
  return {
    user: session.sessionUser,
    isLoaded: session.isLoaded,
  };
}
