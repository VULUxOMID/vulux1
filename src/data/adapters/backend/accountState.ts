import type { BackendHttpClient } from './httpClient';
import { getConfiguredBackendBaseUrl } from '../../../config/backendBaseUrl';

type BackendGetToken = (options?: { template?: string }) => Promise<string | null>;
type UnknownRecord = Record<string, unknown>;
const ACCOUNT_STATE_ENDPOINT = '/api/account/state';
type UpsertAccountStateOptions = Record<string, never>;

function isQaAccountStateDisabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_QA_DISABLE_ACCOUNT_STATE?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown account-state write error';
  }
}

async function readStateFromBackend(
  getToken: BackendGetToken,
  _userId: string | null,
): Promise<UnknownRecord | null> {
  if (isQaAccountStateDisabled()) {
    return null;
  }
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const token = await getToken();
  if (!token) {
    return null;
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${ACCOUNT_STATE_ENDPOINT}`);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Account state backend read failed (${response.status})`);
  }

  const payload = (await response.json()) as UnknownRecord | null;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const nestedState =
    payload.state && typeof payload.state === 'object'
      ? (payload.state as UnknownRecord)
      : null;

  return nestedState ?? payload;
}

async function writeStateToBackend(
  getToken: BackendGetToken,
  _userId: string,
  updates: UnknownRecord,
): Promise<boolean> {
  if (isQaAccountStateDisabled()) {
    return true;
  }
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return false;
  }

  const token = await getToken();
  if (!token) {
    return false;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${ACCOUNT_STATE_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      updates,
    }),
  });

  return response.ok;
}

export async function fetchAccountState(
  _client: BackendHttpClient | null,
  getToken: BackendGetToken,
  userId?: string | null,
): Promise<UnknownRecord | null> {
  try {
    return await readStateFromBackend(getToken, userId ?? null);
  } catch (error) {
    if (__DEV__) {
      console.warn('[data/account-state] Authoritative backend account-state read failed', {
        error: describeError(error),
      });
    }
    return null;
  }
}

export async function upsertAccountState(
  _client: BackendHttpClient | null,
  getToken: BackendGetToken,
  updates: UnknownRecord,
  userId?: string | null,
  options?: UpsertAccountStateOptions,
): Promise<boolean> {
  if (Object.keys(updates).length === 0) return true;

  const normalizedUserId = asString(userId);
  if (normalizedUserId) {
    try {
      const wroteToBackend = await writeStateToBackend(getToken, normalizedUserId, updates);
      if (wroteToBackend) {
        return true;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[data/account-state] Authoritative backend account-state write failed', {
          error: describeError(error),
        });
      }
    }
  }

  return false;
}
