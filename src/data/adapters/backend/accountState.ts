import { getBackendToken } from '../../../utils/backendToken';
import { getBackendTokenTemplate } from '../../../config/backendToken';
import type { BackendHttpClient } from './httpClient';
import { spacetimeDb } from '../../../lib/spacetime';

type BackendGetToken = (options?: { template?: string }) => Promise<string | null>;
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseStateFromSpacetime(userId: string | null | undefined): UnknownRecord | null {
  const normalizedUserId = asString(userId);
  if (!normalizedUserId) return null;

  // accountStateItem is private in Spacetime schema; reads must go through
  // authenticated backend endpoints.
  return null;
}

async function writeStateToSpacetime(
  userId: string,
  updates: UnknownRecord,
): Promise<boolean> {
  try {
    const reducers = spacetimeDb.reducers as any;
    const id = `account-state-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (typeof reducers?.upsertAccountState === 'function') {
      await reducers.upsertAccountState({
        userId,
        updates: JSON.stringify(updates),
      });
    } else {
      await reducers.sendGlobalMessage({
        id,
        roomId: `account:${userId}`,
        item: JSON.stringify({
          eventType: 'account_state_upsert',
          userId,
          updates,
          createdAt: Date.now(),
        }),
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function getAuthedClient(
  client: BackendHttpClient | null,
  getToken: BackendGetToken,
): Promise<BackendHttpClient | null> {
  if (!client) return null;
  const tokenTemplate = getBackendTokenTemplate();
  const token = await getBackendToken(getToken, tokenTemplate);
  if (!token) return null;
  client.setAuth(token);
  return client;
}

export async function fetchAccountState(
  client: BackendHttpClient | null,
  getToken: BackendGetToken,
  userId?: string | null,
): Promise<UnknownRecord | null> {
  const spacetimeState = parseStateFromSpacetime(userId ?? null);
  if (spacetimeState) {
    return spacetimeState;
  }

  const authedClient = await getAuthedClient(client, getToken);
  if (!authedClient) return null;

  try {
    const payload = await authedClient.get<unknown>('/account/state');
    return asRecord(asRecord(payload).state);
  } catch {
    return null;
  }
}

export async function upsertAccountState(
  client: BackendHttpClient | null,
  getToken: BackendGetToken,
  updates: UnknownRecord,
  userId?: string | null,
): Promise<void> {
  if (Object.keys(updates).length === 0) return;

  const normalizedUserId = asString(userId);
  if (normalizedUserId) {
    const wroteToSpacetime = await writeStateToSpacetime(normalizedUserId, updates);
    if (wroteToSpacetime) {
      return;
    }
  }

  const authedClient = await getAuthedClient(client, getToken);
  if (!authedClient) return;

  try {
    await authedClient.post('/account/state/upsert', { updates });
  } catch {
    // Ignore legacy API failures when Spacetime is primary.
  }
}
