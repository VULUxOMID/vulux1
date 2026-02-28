import type { FriendshipsRepository } from '../../contracts';
import type { BackendSnapshot } from './snapshot';
import { spacetimeDb } from '../../../lib/spacetime';

type FriendshipState = {
  pairKey: string;
  userLowId: string;
  userHighId: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked' | 'removed';
  updatedAt: number;
};

type UnknownRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function readTimestampMs(value: unknown): number {
  const direct = asFiniteNumber(value);
  if (direct !== null) return direct;

  if (value && typeof value === 'object') {
    const asObject = value as {
      toMillis?: () => unknown;
      microsSinceUnixEpoch?: unknown;
      __timestamp_micros_since_unix_epoch__?: unknown;
    };
    if (typeof asObject.toMillis === 'function') {
      const millis = asFiniteNumber(asObject.toMillis());
      if (millis !== null) return millis;
    }

    const micros = asObject.microsSinceUnixEpoch ?? asObject.__timestamp_micros_since_unix_epoch__;
    const microsAsNumber = asFiniteNumber(micros);
    if (microsAsNumber !== null) {
      return Math.floor(microsAsNumber / 1000);
    }
  }

  return Date.now();
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : {};
  } catch {
    return {};
  }
}

function buildPairKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('::');
}

function getPairUsers(pairKey: string): [string, string] | null {
  const [userLowId, userHighId] = pairKey.split('::');
  if (!userLowId || !userHighId) return null;
  return [userLowId, userHighId];
}

function getDbFriendshipStates(): Map<string, FriendshipState> {
  // friendship table is private in the schema. Use global friendship events
  // to derive relationship state on the client.
  return new Map<string, FriendshipState>();
}

function applyEventFriendshipStates(states: Map<string, FriendshipState>): boolean {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.globalMessageItem?.iter?.() ?? []);
  let sawFriendshipEvent = false;
  rows.sort(
    (a: any, b: any) =>
      readTimestampMs(a?.createdAt ?? a?.created_at) -
      readTimestampMs(b?.createdAt ?? b?.created_at),
  );

  for (const row of rows) {
    const event = parseJsonRecord(row?.item);
    const eventType = asString(event.eventType);
    if (
      eventType !== 'friend_request' &&
      eventType !== 'friend_response' &&
      eventType !== 'friend_removed'
    ) {
      continue;
    }
    sawFriendshipEvent = true;

    const fromUserId = asString(event.fromUserId);
    const toUserId = asString(event.toUserId);
    if (!fromUserId || !toUserId) continue;

    const pairKey = asString(event.pairKey) ?? buildPairKey(fromUserId, toUserId);
    const users = getPairUsers(pairKey);
    if (!users) continue;
    const [userLowId, userHighId] = users;

    const timestamp = readTimestampMs(row?.createdAt ?? row?.created_at);
    const existing = states.get(pairKey);
    if (existing && existing.updatedAt > timestamp) {
      continue;
    }

    if (eventType === 'friend_removed') {
      states.set(pairKey, {
        pairKey,
        userLowId,
        userHighId,
        status: 'removed',
        updatedAt: timestamp,
      });
      continue;
    }

    if (eventType === 'friend_request') {
      states.set(pairKey, {
        pairKey,
        userLowId,
        userHighId,
        status: 'pending',
        updatedAt: timestamp,
      });
      continue;
    }

    const statusRaw = asString(event.status);
    const status = statusRaw === 'accepted' ? 'accepted' : 'declined';
    states.set(pairKey, {
      pairKey,
      userLowId,
      userHighId,
      status,
      updatedAt: timestamp,
    });
  }

  return sawFriendshipEvent;
}

export function createBackendFriendshipsRepository(
  snapshot: BackendSnapshot,
  viewerUserId: string | null = null,
): FriendshipsRepository {
  return {
    listAcceptedFriendIds() {
      const viewerId = viewerUserId;
      if (!viewerId) {
        return snapshot.acceptedFriendIds;
      }

      const states = getDbFriendshipStates();
      const hasFriendshipRows = states.size > 0;
      const hasFriendshipEvents = applyEventFriendshipStates(states);

      const accepted = new Set<string>();
      for (const state of states.values()) {
        if (state.status !== 'accepted') continue;
        if (state.userLowId !== viewerId && state.userHighId !== viewerId) continue;
        const otherId: string = state.userLowId === viewerId ? state.userHighId : state.userLowId;
        if (otherId && otherId !== viewerId) {
          accepted.add(otherId);
        }
      }

      if (accepted.size === 0 && !hasFriendshipRows && !hasFriendshipEvents) {
        return snapshot.acceptedFriendIds;
      }
      return Array.from(accepted);
    },
  };
}
