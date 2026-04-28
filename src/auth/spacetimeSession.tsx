import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type Session as SupabaseAuthSession,
  type SupabaseClient,
  type User as SupabaseUser,
} from '@supabase/supabase-js';
import { ClerkProvider, useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
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
import {
  readCurrentAuthAccessToken as readCurrentAuthAccessTokenFromHandler,
  setCurrentAuthAccessTokenHandler,
} from './currentAuthAccessToken';
import { getConfiguredBackendBaseUrl } from '../config/backendBaseUrl';
import {
  isQaGuestAuthEnabled,
  readBooleanFlag,
  shouldSkipQaEmailVerification,
  type QaGuestSessionResponse,
} from '../config/qaAuth';
import { readConfiguredClerkPublishableKey } from '../config/clerk';

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

const VULU_SESSION_CACHE_KEY = 'vulu.auth.session';
const LEGACY_SPACETIME_AUTH_TOKEN_STORAGE_KEY = 'spacetimedb.auth_token';
const LEGACY_SPACETIME_REFRESH_TOKEN_STORAGE_KEY = 'spacetimedb.auth_refresh_token';
const QA_GUEST_SESSION_STORAGE_KEY = 'vulu.qa.guest.session';
const SUPABASE_SPIKE_STORAGE_KEY = 'vulu.supabase.spike.session';
const SESSION_SYNC_TIMEOUT_MS = 20_000;
const SESSION_SYNC_POLL_MS = 160;
const SESSION_SYNC_RETRY_BASE_MS = 1_200;
const SESSION_SYNC_RETRY_MAX_MS = 12_000;
const CLERK_PROVIDER = 'clerk';
const QA_GUEST_PROVIDER = 'qa_guest';
const SUPABASE_PROVIDER = 'supabase';
const AUTH_PROVIDER_OVERRIDE_QUERY_PARAM = 'auth_provider';
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

type CachedVuluSession = {
  authProvider?: string | null;
  authUserId: string;
  clerkUserId?: string | null;
  issuer: string | null;
  subject: string | null;
  vuluUserId: string;
  emailAddress: string | null;
  roles: string[];
};

type QaGuestSession = {
  token: string;
  provider: string;
  issuer: string;
  subject: string;
  username: string | null;
  displayName: string | null;
  emailAddress: string | null;
};

type SessionStatus = 'loading' | 'signed_out' | 'needs_verification' | 'syncing' | 'ready';

type SessionContextValue = {
  isLoaded: boolean;
  hasSession: boolean;
  isSignedIn: boolean;
  needsVerification: boolean;
  status: SessionStatus;
  authProvider: string | null;
  authUserId: string | null;
  userId: string | null;
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
  authProvider: null,
  authUserId: null,
  userId: null,
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
let externalQaGuestSessionHandler: ((session: QaGuestSession | null) => Promise<void>) | null =
  null;
let externalGetTokenHandler: (() => Promise<string | null>) | null = null;

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

type SupportedAuthProvider = typeof CLERK_PROVIDER | typeof SUPABASE_PROVIDER;

function normalizeSupportedAuthProvider(value: unknown): SupportedAuthProvider | null {
  const normalized = normalizeString(value)?.toLowerCase();
  if (normalized === CLERK_PROVIDER || normalized === SUPABASE_PROVIDER) {
    return normalized;
  }
  return null;
}

function readEnvAuthProviderOverride(): SupportedAuthProvider | null {
  return (
    normalizeSupportedAuthProvider(process.env.EXPO_PUBLIC_AUTH_PROVIDER) ??
    normalizeSupportedAuthProvider(process.env.NEXT_PUBLIC_AUTH_PROVIDER) ??
    normalizeSupportedAuthProvider(process.env.EXPO_PUBLIC_AUTH_SPIKE_PROVIDER)
  );
}

function readBrowserAuthProviderOverride(): SupportedAuthProvider | null {
  if (typeof window === 'undefined' || typeof window.location?.search !== 'string') {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeSupportedAuthProvider(params.get(AUTH_PROVIDER_OVERRIDE_QUERY_PARAM));
  } catch {
    return null;
  }
}

function readSupabaseSpikeConfig() {
  const url = normalizeString(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = normalizeString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const audience =
    normalizeString(process.env.EXPO_PUBLIC_SUPABASE_JWT_AUDIENCE) ?? 'authenticated';
  const issuer = url ? new URL('/auth/v1', url).toString().replace(/\/$/, '') : null;

  return {
    url,
    anonKey,
    audience,
    issuer,
  };
}

function hasSupabaseAuthConfig(): boolean {
  const { url, anonKey } = readSupabaseSpikeConfig();
  return Boolean(url && anonKey);
}

export function resolvePreferredAuthProvider(): SupportedAuthProvider {
  const explicitOverride = readEnvAuthProviderOverride() ?? readBrowserAuthProviderOverride();
  if (explicitOverride) {
    return explicitOverride;
  }

  if (readBooleanFlag(process.env.EXPO_PUBLIC_SUPABASE_AUTH_SPIKE_ENABLED)) {
    return SUPABASE_PROVIDER;
  }

  return hasSupabaseAuthConfig() ? SUPABASE_PROVIDER : CLERK_PROVIDER;
}

function isSupabaseAuthDefault(): boolean {
  return resolvePreferredAuthProvider() === SUPABASE_PROVIDER;
}

export function isSupabaseAuthSpikeActive(): boolean {
  return isSupabaseAuthDefault();
}

export function buildAuthProviderOverrideUrl(
  baseUrl: string,
  provider: SupportedAuthProvider,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set(AUTH_PROVIDER_OVERRIDE_QUERY_PARAM, provider);
  return url.toString();
}

export function readSupabaseAuthSpikeConfigError(): string | null {
  const { url, anonKey } = readSupabaseSpikeConfig();
  if (url && anonKey) {
    return null;
  }

  return 'Supabase auth requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
}

let supabaseSpikeClient: SupabaseClient | null = null;

function getSupabaseSpikeClient(): SupabaseClient {
  if (supabaseSpikeClient) {
    return supabaseSpikeClient;
  }

  const config = readSupabaseSpikeConfig();
  if (!config.url || !config.anonKey) {
    throw new Error(
      'Supabase auth spike is enabled, but EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.',
    );
  }

  supabaseSpikeClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storageKey: SUPABASE_SPIKE_STORAGE_KEY,
      storage: {
        getItem: (key) => secureStoreGetItem(key),
        setItem: async (key, value) => {
          await secureStoreSetItem(key, value);
        },
        removeItem: async (key) => {
          await secureStoreDeleteItem(key);
        },
      },
    },
  });

  return supabaseSpikeClient;
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
    const authUserId =
      normalizeString(parsed.authUserId) ?? normalizeString(parsed.clerkUserId);
    const vuluUserId = normalizeString(parsed.vuluUserId);
    if (!authUserId || !vuluUserId) {
      return null;
    }
    return {
      authProvider: normalizeString(parsed.authProvider),
      authUserId,
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

async function readQaGuestSession(): Promise<QaGuestSession | null> {
  try {
    const raw = await secureStoreGetItem(QA_GUEST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QaGuestSession>;
    const token = normalizeString(parsed.token);
    const issuer = normalizeString(parsed.issuer);
    const subject = normalizeString(parsed.subject);
    if (!token || !issuer || !subject) {
      return null;
    }
    return {
      token,
      provider: normalizeString(parsed.provider) ?? QA_GUEST_PROVIDER,
      issuer,
      subject,
      username: normalizeString(parsed.username),
      displayName: normalizeString(parsed.displayName),
      emailAddress: normalizeString(parsed.emailAddress),
    };
  } catch {
    return null;
  }
}

async function writeQaGuestSession(nextSession: QaGuestSession): Promise<void> {
  await secureStoreSetItem(QA_GUEST_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
}

async function clearQaGuestSessionStorage(): Promise<void> {
  await secureStoreDeleteItem(QA_GUEST_SESSION_STORAGE_KEY);
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

  return {
    id: normalizeString(user.id) ?? '',
    username: normalizeString(user.username),
    fullName: normalizeString(user.fullName),
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
  await clearQaGuestSessionStorage();
  await secureStoreDeleteItem(SUPABASE_SPIKE_STORAGE_KEY);
  await clearLegacySpacetimeStorage();
  await signOutSpacetimeAuth();
}

function buildGuestSessionUser(
  session: QaGuestSession,
  signOut: () => Promise<void>,
): SessionUser {
  const emailAddress = session.emailAddress;
  return {
    id: session.subject,
    username: session.username,
    fullName: session.displayName ?? session.username,
    imageUrl: null,
    primaryEmailAddress: emailAddress ? { emailAddress } : null,
    emailAddresses: emailAddress ? [{ emailAddress }] : [],
    primaryPhoneNumber: null,
    delete: signOut,
  };
}

function buildSupabaseSessionUser(
  user: SupabaseUser | null,
  signOut: () => Promise<void>,
): SessionUser | null {
  if (!user) {
    return null;
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const emailAddress = normalizeString(user.email);
  const phoneNumber = normalizeString(user.phone);
  const username =
    normalizeString(metadata.username) ??
    normalizeString(metadata.user_name) ??
    normalizeString(metadata.preferred_username);
  const fullName =
    normalizeString(metadata.full_name) ??
    normalizeString(metadata.name) ??
    username;
  const imageUrl =
    normalizeString(metadata.avatar_url) ??
    normalizeString(metadata.picture);

  return {
    id: user.id,
    username,
    fullName,
    imageUrl,
    primaryEmailAddress: emailAddress ? { emailAddress } : null,
    emailAddresses: emailAddress ? [{ emailAddress }] : [],
    primaryPhoneNumber: phoneNumber ? { phoneNumber } : null,
    delete: signOut,
  };
}

function normalizeQaGuestSession(
  session: QaGuestSessionResponse | null | undefined,
): QaGuestSession | null {
  const token = normalizeString(session?.token);
  const issuer = normalizeString(session?.issuer);
  const subject = normalizeString(session?.subject);
  if (!token || !issuer || !subject) {
    return null;
  }
  return {
    token,
    provider: normalizeString(session?.provider) ?? QA_GUEST_PROVIDER,
    issuer,
    subject,
    username: normalizeString(session?.username),
    displayName: normalizeString(session?.displayName),
    emailAddress: normalizeString(session?.emailAddress),
  };
}

function readSupabaseEmailVerified(user: SupabaseUser | null): boolean {
  if (!user) {
    return false;
  }

  return Boolean(normalizeString(user.email_confirmed_at));
}

async function ensureSupabaseSpikeSession(
  client: SupabaseClient,
): Promise<SupabaseAuthSession | null> {
  const existing = await client.auth.getSession();
  if (existing.error) {
    throw existing.error;
  }
  return existing.data.session;
}

type RealtimeSessionExchangeResponse = {
  ok?: boolean;
  code?: unknown;
  message?: unknown;
  session?: {
    token?: unknown;
  };
  user?: {
    id?: unknown;
    profileId?: unknown;
    vuluUserId?: unknown;
    handle?: unknown;
    role?: unknown;
    creatorEnabled?: unknown;
    adminLevel?: unknown;
    accountState?: unknown;
  };
};

type RealtimeSessionExchangeResult = {
  spacetimeToken: string;
  vuluUserId: string | null;
  roles: string[];
};

function deriveRolesFromRealtimeSessionUser(
  user: RealtimeSessionExchangeResponse['user'],
): string[] {
  const roles = new Set<string>();
  const normalizedRole = normalizeString(user?.role)?.toUpperCase() ?? null;
  if (normalizedRole && normalizedRole !== 'USER') {
    roles.add(normalizedRole);
  }
  if (user?.creatorEnabled === true) {
    roles.add('CREATOR');
  }
  return Array.from(roles);
}

async function exchangeRealtimeSession(
  accessToken: string,
  options?: {
    knownVuluUserId?: string | null;
  },
): Promise<RealtimeSessionExchangeResult> {
  const baseUrl = getConfiguredBackendBaseUrl().trim();
  if (!baseUrl) {
    throw new Error('Backend edge API is not configured for realtime session exchange.');
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/realtime/session`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh: true,
      knownVuluUserId: normalizeString(options?.knownVuluUserId) ?? null,
    }),
  });

  const payload = (await response.json().catch(() => null)) as RealtimeSessionExchangeResponse | null;
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string' && payload.message.trim().length > 0
        ? payload.message
        : `Realtime session exchange failed (${response.status})`;
    throw new Error(message);
  }

  const spacetimeToken = normalizeString(payload?.session?.token);
  if (!spacetimeToken) {
    throw new Error('Realtime session exchange completed without returning a Spacetime token.');
  }

  return {
    spacetimeToken,
    vuluUserId: normalizeString(payload?.user?.vuluUserId),
    roles: deriveRolesFromRealtimeSessionUser(payload?.user),
  };
}

export async function signInSupabaseSpike(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeString(email)?.toLowerCase();
  const normalizedPassword = typeof password === 'string' ? password : '';
  if (!normalizedEmail || !normalizedPassword) {
    throw new Error('Enter both your Supabase email and password.');
  }

  const client = getSupabaseSpikeClient();
  const signedIn = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password: normalizedPassword,
  });
  if (signedIn.error) {
    throw signedIn.error;
  }

  if (!signedIn.data.session?.access_token) {
    throw new Error('Supabase sign-in completed without returning an access token.');
  }
}

export async function signUpSupabaseSpike(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeString(email)?.toLowerCase();
  const normalizedPassword = typeof password === 'string' ? password : '';
  if (!normalizedEmail || !normalizedPassword) {
    throw new Error('Enter both your email and password to create an account.');
  }

  const client = getSupabaseSpikeClient();
  const signedUp = await client.auth.signUp({
    email: normalizedEmail,
    password: normalizedPassword,
  });

  if (signedUp.error) {
    throw signedUp.error;
  }

  if (!signedUp.data.user) {
    throw new Error('Supabase signup completed without creating a user.');
  }
}

export async function requestSupabasePasswordReset(email: string): Promise<void> {
  const normalizedEmail = normalizeString(email)?.toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Enter your email address first.');
  }

  const client = getSupabaseSpikeClient();
  const result = await client.auth.resetPasswordForEmail(normalizedEmail);
  if (result.error) {
    throw result.error;
  }
}

export async function resendSupabaseConfirmation(email: string): Promise<void> {
  const normalizedEmail = normalizeString(email)?.toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Enter your email address first.');
  }

  const client = getSupabaseSpikeClient();
  const result = await client.auth.resend({
    type: 'signup',
    email: normalizedEmail,
  });
  if (result.error) {
    throw result.error;
  }
}

export async function applyQaGuestAuthSession(
  session: QaGuestSessionResponse | null,
): Promise<void> {
  const normalized = normalizeQaGuestSession(session);
  if (externalQaGuestSessionHandler) {
    await externalQaGuestSessionHandler(normalized);
    return;
  }

  if (normalized) {
    await writeQaGuestSession(normalized);
  } else {
    await clearQaGuestSessionStorage();
  }
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

  if (
    normalized.includes('identity mapping') &&
    normalized.includes('backfill')
  ) {
    return {
      message:
        'Supabase auth succeeded, but this account is missing its Supabase-to-Spacetime identity mapping. Sign in again on a device with an existing Vulu session, or backfill the mapping before retrying.',
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

async function readSupabaseStoredAccessToken(): Promise<string | null> {
  try {
    const raw = await secureStoreGetItem(SUPABASE_SPIKE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { access_token?: unknown };
    return normalizeString(parsed.access_token);
  } catch {
    return null;
  }
}

export async function readCurrentAuthAccessToken(): Promise<string | null> {
  const handlerToken = normalizeString(await readCurrentAuthAccessTokenFromHandler());
  if (handlerToken) {
    return handlerToken;
  }

  const storedSupabaseToken = await readSupabaseStoredAccessToken();
  if (storedSupabaseToken) {
    return storedSupabaseToken;
  }

  if (resolvePreferredAuthProvider() === SUPABASE_PROVIDER && hasSupabaseAuthConfig()) {
    try {
      const current = await getSupabaseSpikeClient().auth.getSession();
      const token = normalizeString(current.data.session?.access_token);
      if (token) {
        return token;
      }
    } catch {
      // fall through to storage compatibility fallback
    }

    return readSupabaseStoredAccessToken();
  }

  return null;
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
    authUserId: string;
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

  const authUserId = normalizeString(user?.id);
  const emailAddress = readPrimaryEmailAddress(user);
  const emailVerified = shouldSkipQaEmailVerification() ? true : readEmailVerified(user);
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
      if (
        !cached ||
        !authUserId ||
        cached.authProvider !== CLERK_PROVIDER ||
        cached.authUserId !== authUserId
      ) {
        return false;
      }

      setSyncError(null);
      setSyncErrorIsBlocking(false);
      return true;
    },
    [authUserId],
  );

  const commitResolvedIdentity = useCallback((
    nextVuluUserId: string,
    resolvedRoles?: string[],
  ) => {
    const nextRoles = resolvedRoles ?? readRoleNames();
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

    if (!expectedIdentity || expectedIdentity.authUserId !== authUserId) {
      return;
    }

    const nextCache: CachedVuluSession = {
      authProvider: CLERK_PROVIDER,
      authUserId: expectedIdentity.authUserId,
      issuer: expectedIdentity.issuer,
      subject: expectedIdentity.subject,
      vuluUserId: nextVuluUserId,
      emailAddress: expectedIdentity.emailAddress,
      roles: nextRoles,
    };

    void writeCachedSession(nextCache);
    void clearLegacySpacetimeStorage();
  }, [authUserId]);

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
    externalGetTokenHandler = getToken;
    setCurrentAuthAccessTokenHandler(getToken);
    return () => {
      if (externalGetTokenHandler === getToken) {
        externalGetTokenHandler = null;
        setCurrentAuthAccessTokenHandler(null);
      }
    };
  }, [getToken]);

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
    if (!isAuthLoaded || !isUserLoaded || !clerkHasSession || !emailVerified || !authUserId) {
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
        const subject = readClaimString(claims, 'sub') ?? authUserId;
        const normalizedEmail = readClaimString(claims, 'email') ?? emailAddress;
        const jwtEmailVerified = readClaimBoolean(claims, 'email_verified');

        if (!issuer || !subject) {
          throw new Error('Clerk JWT is missing iss/sub claims.');
        }

        expectedIdentityRef.current = {
          authUserId,
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
    authUserId,
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
      authProvider: CLERK_PROVIDER,
      authUserId,
      userId: vuluUserId,
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
      authUserId,
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

function QaGuestSessionBridge({ children }: { children: ReactNode }) {
  const authIdentitySubscriptionRef = useRef<(() => void) | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAttemptRef = useRef(0);
  const expectedIdentityRef = useRef<{
    authUserId: string;
    issuer: string;
    subject: string;
    emailAddress: string | null;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [guestSession, setGuestSession] = useState<QaGuestSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [vuluUserId, setVuluUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorIsBlocking, setSyncErrorIsBlocking] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const clearAuthIdentitySubscription = useCallback(() => {
    if (!authIdentitySubscriptionRef.current) {
      return;
    }

    authIdentitySubscriptionRef.current();
    authIdentitySubscriptionRef.current = null;
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current || !guestSession) {
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      syncAttemptRef.current += 1;
      setSyncNonce((current) => current + 1);
      setStatus((current) => (current === 'ready' ? current : 'syncing'));
    }, SESSION_SYNC_RETRY_BASE_MS);
  }, [guestSession]);

  const commitResolvedIdentity = useCallback(
    (nextVuluUserId: string) => {
      if (!guestSession) {
        return;
      }

      const nextRoles = readRoleNames();
      setVuluUserId((current) => (current === nextVuluUserId ? current : nextVuluUserId));
      setRoles((current) => (current.join('|') === nextRoles.join('|') ? current : nextRoles));
      setSyncError(null);
      setSyncErrorIsBlocking(false);
      setStatus('ready');

      void writeCachedSession({
        authProvider: guestSession.provider,
        authUserId: guestSession.subject,
        issuer: guestSession.issuer,
        subject: guestSession.subject,
        vuluUserId: nextVuluUserId,
        emailAddress: guestSession.emailAddress,
        roles: nextRoles,
      });
      void clearLegacySpacetimeStorage();
    },
    [guestSession],
  );

  const signOut = useCallback(async () => {
    clearRetryTimer();
    clearAuthIdentitySubscription();
    expectedIdentityRef.current = null;
    syncAttemptRef.current += 1;
    setGuestSession(null);
    setVuluUserId(null);
    setRoles([]);
    setSyncError(null);
    setSyncErrorIsBlocking(false);
    setStatus('signed_out');
    setIsLoaded(true);
    await clearLocalSessionArtifacts();
  }, [clearAuthIdentitySubscription, clearRetryTimer]);

  const applyGuestSession = useCallback(
    async (nextSession: QaGuestSession | null) => {
      clearRetryTimer();
      clearAuthIdentitySubscription();
      expectedIdentityRef.current = null;
      syncAttemptRef.current += 1;

      if (!nextSession) {
        setGuestSession(null);
        setVuluUserId(null);
        setRoles([]);
        setSyncError(null);
        setSyncErrorIsBlocking(false);
        setStatus('signed_out');
        setIsLoaded(true);
        await clearLocalSessionArtifacts();
        return;
      }

      await writeQaGuestSession(nextSession);
      setGuestSession(nextSession);
      setVuluUserId(null);
      setRoles([]);
      setSyncError(null);
      setSyncErrorIsBlocking(false);
      setStatus('syncing');
      setIsLoaded(true);
      setSyncNonce((current) => current + 1);
    },
    [clearAuthIdentitySubscription, clearRetryTimer],
  );

  useEffect(() => {
    externalSignOutHandler = signOut;
    externalQaGuestSessionHandler = applyGuestSession;
    return () => {
      if (externalSignOutHandler === signOut) {
        externalSignOutHandler = null;
      }
      if (externalQaGuestSessionHandler === applyGuestSession) {
        externalQaGuestSessionHandler = null;
      }
    };
  }, [applyGuestSession, signOut]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const existing = await readQaGuestSession();
      if (cancelled) {
        return;
      }
      setGuestSession(existing);
      setStatus(existing ? 'syncing' : 'signed_out');
      setIsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTokenRefreshHandler(async () => guestSession?.token ?? null);
    return () => {
      setTokenRefreshHandler(null);
    };
  }, [guestSession]);

  useEffect(() => {
    if (!isLoaded || !guestSession) {
      return;
    }

    let cancelled = false;
    const attempt = syncAttemptRef.current;

    const runSync = async () => {
      clearRetryTimer();
      setStatus((current) => (current === 'ready' ? current : 'syncing'));

      try {
        const claims = parseJwtClaims(guestSession.token);
        const issuer = readClaimString(claims, 'iss') ?? guestSession.issuer;
        const subject = readClaimString(claims, 'sub') ?? guestSession.subject;
        const normalizedEmail = readClaimString(claims, 'email') ?? guestSession.emailAddress;

        if (!issuer || !subject) {
          throw new Error('QA guest JWT is missing iss/sub claims.');
        }

        expectedIdentityRef.current = {
          authUserId: subject,
          issuer,
          subject,
          emailAddress: normalizedEmail,
        };

        await setSpacetimeAuthToken(guestSession.token);
        if (!authIdentitySubscriptionRef.current) {
          authIdentitySubscriptionRef.current = subscribeAuthIdentity();
        }
        connectSpacetimeDB();
        await waitForSpacetimeConnection();

        const procedureResolution = await resolveIdentityViaProcedure({
          provider: QA_GUEST_PROVIDER,
          issuer,
          subject,
          email: normalizedEmail,
          emailVerified: true,
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
          provider: QA_GUEST_PROVIDER,
          issuer,
          subject,
          email: normalizedEmail,
          emailVerified: true,
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
          scheduleRetry();
        }
      }
    };

    void runSync();

    return () => {
      cancelled = true;
    };
  }, [clearRetryTimer, commitResolvedIdentity, guestSession, isLoaded, scheduleRetry, syncNonce]);

  useEffect(() => {
    if (!isLoaded || !guestSession) {
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
  }, [commitResolvedIdentity, guestSession, isLoaded]);

  useEffect(
    () => () => {
      clearRetryTimer();
      clearAuthIdentitySubscription();
    },
    [clearAuthIdentitySubscription, clearRetryTimer],
  );

  const hasSession = Boolean(guestSession);
  const emailAddress = guestSession?.emailAddress ?? null;
  const authUserId = guestSession?.subject ?? null;
  const emailVerified = hasSession;
  const isSignedIn = Boolean(hasSession && vuluUserId && status === 'ready');
  const sessionUser = useMemo(
    () => (guestSession ? buildGuestSessionUser(guestSession, signOut) : null),
    [guestSession, signOut],
  );
  const getToken = useCallback(async () => guestSession?.token ?? null, [guestSession]);

  useEffect(() => {
    externalGetTokenHandler = getToken;
    setCurrentAuthAccessTokenHandler(getToken);
    return () => {
      if (externalGetTokenHandler === getToken) {
        externalGetTokenHandler = null;
        setCurrentAuthAccessTokenHandler(null);
      }
    };
  }, [getToken]);

  const value = useMemo<SessionContextValue>(
    () => ({
      isLoaded,
      hasSession,
      isSignedIn,
      needsVerification: false,
      status,
      authProvider: guestSession?.provider ?? null,
      authUserId,
      userId: vuluUserId,
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
      authUserId,
      emailAddress,
      emailVerified,
      getToken,
      hasSession,
      isLoaded,
      isSignedIn,
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

function SupabaseSessionBridge({ children }: { children: ReactNode }) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const initErrorRef = useRef<string | null>(null);
  if (!clientRef.current && !initErrorRef.current) {
    try {
      clientRef.current = getSupabaseSpikeClient();
    } catch (error) {
      initErrorRef.current =
        error instanceof Error ? error.message : 'Failed to initialize Supabase auth spike.';
    }
  }

  const client = clientRef.current;
  const authIdentitySubscriptionRef = useRef<(() => void) | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAttemptRef = useRef(0);
  const syncRetryCountRef = useRef(0);
  const expectedIdentityRef = useRef<{
    authUserId: string;
    issuer: string;
    subject: string;
    emailAddress: string | null;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [supabaseSession, setSupabaseSession] = useState<SupabaseAuthSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [vuluUserId, setVuluUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(initErrorRef.current);
  const [syncErrorIsBlocking, setSyncErrorIsBlocking] = useState(Boolean(initErrorRef.current));
  const [syncNonce, setSyncNonce] = useState(0);

  const authUserId = normalizeString(supabaseSession?.user?.id);
  const emailAddress = normalizeString(supabaseSession?.user?.email);
  const emailVerified = readSupabaseEmailVerified(supabaseSession?.user ?? null);
  const hasSession = Boolean(normalizeString(supabaseSession?.access_token));

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) {
      return;
    }
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const clearAuthIdentitySubscription = useCallback(() => {
    if (!authIdentitySubscriptionRef.current) {
      return;
    }

    authIdentitySubscriptionRef.current();
    authIdentitySubscriptionRef.current = null;
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current || !hasSession || !emailVerified) {
      return;
    }

    const delayMs = Math.min(
      SESSION_SYNC_RETRY_MAX_MS,
      SESSION_SYNC_RETRY_BASE_MS * 2 ** syncRetryCountRef.current,
    );
    syncRetryCountRef.current = Math.min(syncRetryCountRef.current + 1, 6);

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      syncAttemptRef.current += 1;
      setSyncNonce((current) => current + 1);
      setStatus((current) => (current === 'ready' ? current : 'syncing'));
    }, delayMs);
  }, [emailVerified, hasSession]);

  const applyCachedSession = useCallback((cached: CachedVuluSession | null) => {
    if (
      !cached ||
      !authUserId ||
      cached.authProvider !== SUPABASE_PROVIDER ||
      cached.authUserId !== authUserId
    ) {
      return false;
    }

    setSyncError(null);
    setSyncErrorIsBlocking(false);
    return true;
  }, [authUserId]);

  const commitResolvedIdentity = useCallback((
    nextVuluUserId: string,
    resolvedRoles?: string[],
  ) => {
    const nextRoles = resolvedRoles ?? readRoleNames();
    const expectedIdentity = expectedIdentityRef.current;

    syncRetryCountRef.current = 0;
    setVuluUserId((current) => (current === nextVuluUserId ? current : nextVuluUserId));
    setRoles((current) => (current.join('|') === nextRoles.join('|') ? current : nextRoles));
    setSyncError(null);
    setSyncErrorIsBlocking(false);
    setStatus('ready');

    if (!expectedIdentity || expectedIdentity.authUserId !== authUserId) {
      return;
    }

    void writeCachedSession({
      authProvider: SUPABASE_PROVIDER,
      authUserId: expectedIdentity.authUserId,
      issuer: expectedIdentity.issuer,
      subject: expectedIdentity.subject,
      vuluUserId: nextVuluUserId,
      emailAddress: expectedIdentity.emailAddress,
      roles: nextRoles,
    });
    void clearLegacySpacetimeStorage();
  }, [authUserId]);

  const signOut = useCallback(async () => {
    clearRetryTimer();
    clearAuthIdentitySubscription();
    expectedIdentityRef.current = null;
    syncAttemptRef.current += 1;
    setSupabaseSession(null);
    setVuluUserId(null);
    setRoles([]);
    setSyncError(null);
    setSyncErrorIsBlocking(false);
    setStatus('signed_out');
    setIsLoaded(true);

    try {
      if (client) {
        await client.auth.signOut();
      }
    } finally {
      await clearLocalSessionArtifacts();
    }
  }, [clearAuthIdentitySubscription, clearRetryTimer, client]);

  useEffect(() => {
    externalSignOutHandler = signOut;
    return () => {
      if (externalSignOutHandler === signOut) {
        externalSignOutHandler = null;
      }
    };
  }, [signOut]);

  useEffect(() => {
    if (!client) {
      setIsLoaded(true);
      setStatus('signed_out');
      setSyncError(initErrorRef.current);
      setSyncErrorIsBlocking(Boolean(initErrorRef.current));
      return;
    }

    client.auth.startAutoRefresh?.();
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSupabaseSession(nextSession);
      setIsLoaded(true);
      setStatus(nextSession?.access_token ? 'syncing' : 'signed_out');
      if (nextSession?.access_token) {
        setSyncError(null);
        setSyncErrorIsBlocking(false);
      }
    });

    let cancelled = false;
    void (async () => {
      try {
        const nextSession = await ensureSupabaseSpikeSession(client);
        if (cancelled) {
          return;
        }

        setSupabaseSession(nextSession);
        setIsLoaded(true);
        setStatus(nextSession?.access_token ? 'syncing' : 'signed_out');
        if (!nextSession?.access_token) {
          setSyncError(null);
          setSyncErrorIsBlocking(false);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const formatted = formatSessionSyncError(error);
        setIsLoaded(true);
        setStatus('signed_out');
        setSyncError(formatted.message);
        setSyncErrorIsBlocking(true);
      }
    })();

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
      client.auth.stopAutoRefresh?.();
    };
  }, [client]);

  useEffect(() => {
    setTokenRefreshHandler(async () => {
      if (!client) {
        return null;
      }

      const cached = await readCachedSession();
      const knownCachedVuluUserId =
        cached &&
        cached.authProvider === SUPABASE_PROVIDER &&
        cached.authUserId === authUserId
          ? cached.vuluUserId
          : null;

      const refreshed = await client.auth.refreshSession();
      const fallbackToken = async () => {
        const fallback = await client.auth.getSession();
        return fallback.data.session?.access_token ?? null;
      };
      if (refreshed.error) {
        const fallbackAccessToken = await fallbackToken();
        if (!fallbackAccessToken) {
          return null;
        }
        const exchanged = await exchangeRealtimeSession(fallbackAccessToken, {
          knownVuluUserId: knownCachedVuluUserId,
        });
        return exchanged.spacetimeToken;
      }

      const accessToken = refreshed.data.session?.access_token ?? (await fallbackToken());
      if (!accessToken) {
        return null;
      }

      const exchanged = await exchangeRealtimeSession(accessToken, {
        knownVuluUserId: knownCachedVuluUserId,
      });
      return exchanged.spacetimeToken;
    });

    return () => {
      setTokenRefreshHandler(null);
    };
  }, [authUserId, client]);

  useEffect(() => {
    if (!isLoaded) {
      setStatus('loading');
      return;
    }

    clearRetryTimer();
    syncRetryCountRef.current = 0;

    if (!hasSession) {
      clearAuthIdentitySubscription();
      expectedIdentityRef.current = null;
      syncAttemptRef.current += 1;
      setVuluUserId(null);
      setRoles([]);
      setStatus('signed_out');
      disconnectSpacetimeDB();
      void setSpacetimeAuthToken(null);
      return;
    }

    if (!emailVerified) {
      clearAuthIdentitySubscription();
      expectedIdentityRef.current = null;
      syncAttemptRef.current += 1;
      setVuluUserId(null);
      setRoles([]);
      setStatus('needs_verification');
      disconnectSpacetimeDB();
      void setSpacetimeAuthToken(null);
      return;
    }

    void (async () => {
      const cached = await readCachedSession();
      applyCachedSession(cached);
    })();

    setStatus((current) => (current === 'ready' ? current : 'syncing'));
  }, [
    applyCachedSession,
    clearAuthIdentitySubscription,
    clearRetryTimer,
    emailVerified,
    hasSession,
    isLoaded,
  ]);

  useEffect(() => {
    if (!client || !isLoaded || !hasSession || !emailVerified || !authUserId || !supabaseSession) {
      return;
    }

    let cancelled = false;
    const attempt = syncAttemptRef.current;

    const runSync = async () => {
      clearRetryTimer();
      setStatus((current) => (current === 'ready' ? current : 'syncing'));

      try {
        const token = normalizeString(supabaseSession.access_token);
        if (!token) {
          throw new Error('Supabase session is active, but no access token was returned.');
        }

        const claims = parseJwtClaims(token);
        const config = readSupabaseSpikeConfig();
        const issuer = readClaimString(claims, 'iss') ?? config.issuer;
        const subject = readClaimString(claims, 'sub') ?? authUserId;
        const normalizedEmail = readClaimString(claims, 'email') ?? emailAddress;
        const jwtEmailVerified = readClaimBoolean(claims, 'email_verified');

        if (!issuer || !subject) {
          throw new Error('Supabase JWT is missing iss/sub claims.');
        }

        expectedIdentityRef.current = {
          authUserId,
          issuer,
          subject,
          emailAddress: normalizedEmail,
        };

        const cached = await readCachedSession();
        const knownCachedVuluUserId =
          cached &&
          cached.authProvider === SUPABASE_PROVIDER &&
          cached.authUserId === authUserId
            ? cached.vuluUserId
            : null;
        const realtimeSession = await exchangeRealtimeSession(token, {
          knownVuluUserId: knownCachedVuluUserId,
        });

        if (realtimeSession.vuluUserId) {
          await setSpacetimeAuthToken(realtimeSession.spacetimeToken);
          connectSpacetimeDB();
          await waitForSpacetimeConnection();

          if (cancelled || attempt !== syncAttemptRef.current) {
            return;
          }

          commitResolvedIdentity(realtimeSession.vuluUserId, realtimeSession.roles);
          return;
        }

        throw new Error(
          'Realtime session exchange completed without returning a vulu_user_id mapping.',
        );
      } catch (error) {
        if (cancelled || attempt !== syncAttemptRef.current) {
          return;
        }

        const formatted = formatSessionSyncError(error);
        setSyncError(formatted.message);
        setSyncErrorIsBlocking(formatted.blocking);
        setStatus('syncing');
        if (!formatted.blocking) {
          scheduleRetry();
        }
      }
    };

    void runSync();

    return () => {
      cancelled = true;
    };
  }, [
    authUserId,
    clearRetryTimer,
    client,
    commitResolvedIdentity,
    emailAddress,
    emailVerified,
    hasSession,
    isLoaded,
    scheduleRetry,
    supabaseSession,
    syncNonce,
  ]);

  useEffect(
    () => () => {
      clearRetryTimer();
      clearAuthIdentitySubscription();
    },
    [clearAuthIdentitySubscription, clearRetryTimer],
  );

  const isSignedIn = Boolean(hasSession && emailVerified && vuluUserId && status === 'ready');
  const needsVerification = Boolean(hasSession && !emailVerified);
  const sessionUser = useMemo(
    () => buildSupabaseSessionUser(supabaseSession?.user ?? null, signOut),
    [signOut, supabaseSession?.user],
  );
  const getToken = useCallback(async () => {
    if (!client) {
      return null;
    }
    const current = await client.auth.getSession();
    return current.data.session?.access_token ?? null;
  }, [client]);

  useEffect(() => {
    externalGetTokenHandler = getToken;
    setCurrentAuthAccessTokenHandler(getToken);
    return () => {
      if (externalGetTokenHandler === getToken) {
        externalGetTokenHandler = null;
        setCurrentAuthAccessTokenHandler(null);
      }
    };
  }, [getToken]);

  const value = useMemo<SessionContextValue>(
    () => ({
      isLoaded,
      hasSession,
      isSignedIn,
      needsVerification,
      status,
      authProvider: SUPABASE_PROVIDER,
      authUserId,
      userId: vuluUserId,
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
      authUserId,
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
  if (isQaGuestAuthEnabled()) {
    return <QaGuestSessionBridge>{children}</QaGuestSessionBridge>;
  }

  if (isSupabaseAuthDefault()) {
    return <SupabaseSessionBridge>{children}</SupabaseSessionBridge>;
  }

  const clerkPublishableKey = readConfiguredClerkPublishableKey();

  if (!clerkPublishableKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Clerk is now the only auth provider for Vulu.',
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
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
    authProvider: session.authProvider,
    authUserId: session.authUserId,
    userId: session.userId,
    clerkUserId: session.authProvider === CLERK_PROVIDER ? session.authUserId : null,
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
