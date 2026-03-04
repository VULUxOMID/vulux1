import type { BackendHttpClient } from './httpClient';
import {
  connectSpacetimeDB,
  getSpacetimeTelemetrySnapshot,
  spacetimeDb,
} from '../../../lib/spacetime';

type BackendGetToken = (options?: { template?: string }) => Promise<string | null>;
type UnknownRecord = Record<string, unknown>;
type ReducersHandle = {
  upsertAccountState?: (args: { userId: string; updates: string }) => Promise<unknown>;
  sendGlobalMessage?: (args: { id: string; roomId: string; item: string }) => Promise<unknown>;
};

const WRITE_REDUCER_READINESS_WAIT_MS = 2_000;
const WRITE_REDUCER_READINESS_POLL_MS = 120;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function parseStateFromSpacetime(userId: string | null | undefined): UnknownRecord | null {
  const normalizedUserId = asString(userId);
  if (!normalizedUserId) return null;

  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.myAccountState?.iter?.() ?? dbView?.my_account_state?.iter?.() ?? []);
  const matchingRow =
    rows.find((row) => {
      const rowUserId = asString(row?.userId ?? row?.user_id);
      return !rowUserId || rowUserId === normalizedUserId;
    }) ?? rows[0];

  if (!matchingRow) {
    return null;
  }

  const rawState = matchingRow?.state ?? matchingRow?.item;
  const parsedState = parseJsonRecord(rawState);
  return Object.keys(parsedState).length > 0 ? parsedState : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function resolveWritableReducers(): ReducersHandle | null {
  const reducers = spacetimeDb.reducers as ReducersHandle;
  if (
    typeof reducers?.upsertAccountState === 'function' ||
    typeof reducers?.sendGlobalMessage === 'function'
  ) {
    return reducers;
  }
  return null;
}

async function waitForWritableReducers(maxWaitMs: number): Promise<ReducersHandle | null> {
  const deadlineMs = Date.now() + Math.max(0, maxWaitMs);
  connectSpacetimeDB();

  while (Date.now() <= deadlineMs) {
    const reducers = resolveWritableReducers();
    if (reducers) {
      return reducers;
    }
    await delay(WRITE_REDUCER_READINESS_POLL_MS);
  }

  return resolveWritableReducers();
}

async function writeStateToSpacetime(
  userId: string,
  updates: UnknownRecord,
): Promise<boolean> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const reducers = await waitForWritableReducers(WRITE_REDUCER_READINESS_WAIT_MS);
      if (!reducers) {
        throw new Error('SpacetimeDB reducers unavailable for account state writes.');
      }
      const id = `account-state-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (typeof reducers?.upsertAccountState === 'function') {
        await reducers.upsertAccountState({
          userId,
          updates: JSON.stringify(updates),
        });
      } else if (typeof reducers?.sendGlobalMessage === 'function') {
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
      } else {
        throw new Error('SpacetimeDB reducers unavailable for account state writes.');
      }

      return true;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await delay(300 * (attempt + 1));
      }
    }
  }

  if (__DEV__) {
    const telemetry = getSpacetimeTelemetrySnapshot();
    console.warn(
      '[data/account-state] Failed to write account state to SpacetimeDB',
      {
        error: describeError(lastError),
        connectionState: telemetry.connectionState,
        subscriptionState: telemetry.subscriptionState,
      },
    );
  }

  return false;
}

export async function fetchAccountState(
  _client: BackendHttpClient | null,
  _getToken: BackendGetToken,
  userId?: string | null,
): Promise<UnknownRecord | null> {
  return parseStateFromSpacetime(userId ?? null);
}

export async function upsertAccountState(
  _client: BackendHttpClient | null,
  _getToken: BackendGetToken,
  updates: UnknownRecord,
  userId?: string | null,
): Promise<boolean> {
  if (Object.keys(updates).length === 0) return true;

  const normalizedUserId = asString(userId);
  if (normalizedUserId) {
    const wroteToSpacetime = await writeStateToSpacetime(normalizedUserId, updates);
    if (wroteToSpacetime) {
      return true;
    }
  }

  return false;
}
