import { getConfiguredBackendBaseUrl, resolveConfiguredHttpUrl } from './backendBaseUrl';
import { buildClerkOverrideUrl, readConfiguredClerkPublishableKey } from './clerk';

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readBooleanFlag(value: unknown): boolean {
  const normalized = normalize(value)?.toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(base64: string): string | null {
  let buffer = 0;
  let bits = 0;
  let output = '';

  for (let index = 0; index < base64.length; index += 1) {
    const char = base64[index];
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
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  try {
    const encoded = output
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('');
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function decodeClerkFrontendHostFromPublishableKey(key: string | null): string | null {
  const trimmed = normalize(key);
  const marker = trimmed?.startsWith('pk_test_')
    ? 'pk_test_'
    : trimmed?.startsWith('pk_live_')
      ? 'pk_live_'
      : null;
  if (!trimmed || !marker) {
    return null;
  }

  const encoded = trimmed.slice(marker.length).replace(/\$/g, '');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  try {
    const decoded = decodeBase64(padded)?.replace(/\$/g, '').trim() ?? null;
    return decoded || null;
  } catch {
    return null;
  }
}

export function getQaAuthHelperUrl(): string | null {
  return (
    normalize(resolveConfiguredHttpUrl(process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL)) ??
    normalize(getConfiguredBackendBaseUrl())
  );
}

export function isQaPasswordlessLoginEnabled(): boolean {
  return readBooleanFlag(process.env.EXPO_PUBLIC_QA_PASSWORDLESS_LOGIN);
}

export function isQaGuestAuthEnabled(): boolean {
  return readBooleanFlag(process.env.EXPO_PUBLIC_QA_GUEST_AUTH_ENABLE);
}

export function shouldSkipQaEmailVerification(): boolean {
  return readBooleanFlag(process.env.EXPO_PUBLIC_QA_SKIP_EMAIL_VERIFICATION);
}

type QaTicketResponse = {
  ticket: string;
  authProvider?: string;
  authUserId?: string;
  clerkUserId?: string;
  frontendApi?: string;
  publishableKey?: string;
  expiresInSeconds?: number;
};

export type QaGuestSessionResponse = {
  token: string;
  provider?: string;
  issuer?: string;
  subject?: string;
  username?: string;
  displayName?: string;
  emailAddress?: string;
  expiresInSeconds?: number;
};

export async function requestQaClerkSignInTicket(identifier: string): Promise<QaTicketResponse> {
  const helperUrl = getQaAuthHelperUrl();
  if (!helperUrl) {
    throw new Error('QA auth helper URL is not configured.');
  }

  const publishableKey = readConfiguredClerkPublishableKey();

  const response = await fetch(`${helperUrl.replace(/\/+$/, '')}/qa/clerk-ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier,
      publishableKey,
      frontendApi: decodeClerkFrontendHostFromPublishableKey(publishableKey),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & Partial<QaTicketResponse>)
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.trim() || 'QA auth helper request failed.');
  }

  const ticket = normalize(payload?.ticket);
  if (!ticket) {
    throw new Error('QA auth helper did not return a sign-in ticket.');
  }

  return {
    ticket,
    authProvider: normalize(payload?.authProvider) ?? 'clerk',
    authUserId:
      normalize(payload?.authUserId) ?? normalize(payload?.clerkUserId) ?? undefined,
    clerkUserId:
      normalize(payload?.authUserId) ?? normalize(payload?.clerkUserId) ?? undefined,
    frontendApi: normalize(payload?.frontendApi) ?? undefined,
    publishableKey: normalize(payload?.publishableKey) ?? undefined,
    expiresInSeconds:
      typeof payload?.expiresInSeconds === 'number' ? payload.expiresInSeconds : undefined,
  };
}

const QA_PENDING_CLERK_TICKET_STORAGE_KEY = 'vulu.qa.pending_clerk_ticket';

type PendingQaClerkTicket = {
  ticket: string;
  publishableKey: string;
};

export function writePendingQaClerkTicket(value: PendingQaClerkTicket | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!value) {
      window.localStorage.removeItem(QA_PENDING_CLERK_TICKET_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(QA_PENDING_CLERK_TICKET_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures in QA-only helpers.
  }
}

export function readPendingQaClerkTicket(): PendingQaClerkTicket | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(QA_PENDING_CLERK_TICKET_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PendingQaClerkTicket> | null;
    const ticket = normalize(parsed?.ticket);
    const publishableKey = normalize(parsed?.publishableKey);
    if (!ticket || !publishableKey) {
      window.localStorage.removeItem(QA_PENDING_CLERK_TICKET_STORAGE_KEY);
      return null;
    }
    return { ticket, publishableKey };
  } catch {
    return null;
  }
}

export function clearPendingQaClerkTicket(): void {
  writePendingQaClerkTicket(null);
}

export function redirectToQaClerkOverride(publishableKey: string): never {
  if (typeof window === 'undefined') {
    throw new Error('QA Clerk override redirect requires a browser environment.');
  }

  const currentUrl = buildClerkOverrideUrl(window.location.href, publishableKey);
  window.location.replace(currentUrl);
  throw new Error('Redirecting to QA Clerk override.');
}

export async function requestQaGuestSession(
  identifier: string,
): Promise<QaGuestSessionResponse> {
  const helperUrl = getQaAuthHelperUrl();
  if (!helperUrl) {
    throw new Error('QA auth helper URL is not configured.');
  }

  const normalizedIdentifier = normalize(identifier);
  if (!normalizedIdentifier) {
    throw new Error('Enter a username or nickname.');
  }

  const response = await fetch(`${helperUrl.replace(/\/+$/, '')}/qa/guest-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: normalizedIdentifier,
      username: normalizedIdentifier,
      displayName: normalizedIdentifier,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & Partial<QaGuestSessionResponse>)
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.trim() || 'QA guest auth request failed.');
  }

  const token = normalize(payload?.token);
  if (!token) {
    throw new Error('QA guest auth helper did not return a session token.');
  }

  return {
    token,
    provider: normalize(payload?.provider) ?? undefined,
    issuer: normalize(payload?.issuer) ?? undefined,
    subject: normalize(payload?.subject) ?? undefined,
    username: normalize(payload?.username) ?? undefined,
    displayName: normalize(payload?.displayName) ?? undefined,
    emailAddress: normalize(payload?.emailAddress) ?? undefined,
    expiresInSeconds:
      typeof payload?.expiresInSeconds === 'number' ? payload.expiresInSeconds : undefined,
  };
}
