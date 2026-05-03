import { getConfiguredBackendBaseUrl, resolveConfiguredHttpUrl } from './backendBaseUrl';

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

function readRuntimeDevFlag(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.local')
  ) {
    return true;
  }

  if (/^10(?:\.\d{1,3}){3}$/.test(normalized)) {
    return true;
  }
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(normalized)) {
    return true;
  }

  const rfc1918Range = normalized.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  if (rfc1918Range) {
    const secondOctet = Number(rfc1918Range[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

export function isQaGuestAuthSafeHost(url: string): boolean {
  const normalizedUrl = normalize(url);
  if (!normalizedUrl) {
    return false;
  }

  try {
    const parsed = new URL(normalizedUrl);
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function getQaAuthHelperUrl(): string | null {
  const resolved =
    normalize(resolveConfiguredHttpUrl(process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL)) ??
    normalize(getConfiguredBackendBaseUrl());
  if (!resolved || !isQaGuestAuthSafeHost(resolved)) {
    return null;
  }
  return resolved;
}

export function isQaGuestAuthEnabled(): boolean {
  return readBooleanFlag(process.env.EXPO_PUBLIC_QA_GUEST_AUTH_ENABLE) &&
    readRuntimeDevFlag() &&
    Boolean(getQaAuthHelperUrl());
}

export function shouldSkipQaEmailVerification(): boolean {
  return readBooleanFlag(process.env.EXPO_PUBLIC_QA_SKIP_EMAIL_VERIFICATION);
}

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

export async function requestQaGuestSession(
  identifier: string,
): Promise<QaGuestSessionResponse> {
  if (!readRuntimeDevFlag()) {
    throw new Error('QA guest auth is only available in development builds.');
  }

  const helperUrl = getQaAuthHelperUrl();
  if (!helperUrl) {
    throw new Error('QA guest auth requires a local development helper URL.');
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
  const issuer = normalize(payload?.issuer);
  const subject = normalize(payload?.subject);
  if (!token) {
    throw new Error('QA guest auth helper did not return a session token.');
  }
  if (!issuer || !subject) {
    throw new Error('QA guest auth helper returned an invalid session payload.');
  }

  return {
    token,
    provider: normalize(payload?.provider) ?? undefined,
    issuer,
    subject,
    username: normalize(payload?.username) ?? undefined,
    displayName: normalize(payload?.displayName) ?? undefined,
    emailAddress: normalize(payload?.emailAddress) ?? undefined,
    expiresInSeconds:
      typeof payload?.expiresInSeconds === 'number' ? payload.expiresInSeconds : undefined,
  };
}
