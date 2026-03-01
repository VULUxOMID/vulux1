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
): Promise<void> {
  if (Object.keys(updates).length === 0) return;

  const normalizedUserId = asString(userId);
  if (normalizedUserId) {
    const wroteToSpacetime = await writeStateToSpacetime(normalizedUserId, updates);
    if (wroteToSpacetime) {
      return;
    }
  }

  if (__DEV__) {
    console.warn('[data/account-state] Failed to write account state to SpacetimeDB');
  }
}
