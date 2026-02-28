import type { SocialRepository, SocialUser } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';
import type { BackendHttpClient } from './httpClient';
import { postSafe } from './httpMutations';
import { spacetimeDb } from '../../../lib/spacetime';
import { requestBackendRefresh } from './refreshBus';

type UnknownRecord = Record<string, unknown>;
let lastKnownSocialUsers: SocialUser[] = [];
type SocialPresenceStatus = NonNullable<SocialUser['status']>;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
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

function statusIsOnline(status: SocialPresenceStatus): boolean {
  return status === 'live' || status === 'online' || status === 'busy';
}

function normalizeSocialStatus(
  status: unknown,
  fallback?: {
    status?: unknown;
    isLive?: unknown;
    isOnline?: unknown;
  },
): SocialPresenceStatus {
  const parse = (value: unknown): SocialPresenceStatus | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'live' ||
      normalized === 'online' ||
      normalized === 'busy' ||
      normalized === 'offline' ||
      normalized === 'recent'
    ) {
      return normalized;
    }
    return null;
  };

  const direct = parse(status);
  if (direct) return direct;

  const fallbackStatus = parse(fallback?.status);
  if (fallbackStatus) return fallbackStatus;

  const fallbackIsLive = asBoolean(fallback?.isLive) === true;
  if (fallbackIsLive) return 'live';
  const fallbackIsOnline = asBoolean(fallback?.isOnline) === true;
  if (fallbackIsOnline) return 'online';

  return 'offline';
}

function withDefaultUser(userId: string): SocialUser {
  return {
    id: userId,
    username: userId,
    avatarUrl: '',
    isOnline: false,
    isLive: false,
    status: 'offline',
    statusText: '',
    lastSeen: '',
  };
}

function isGenericUsername(value: string | null | undefined, userId: string): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'you' || normalized === 'user' || normalized === userId.toLowerCase();
}

function pickBestUsername(
  userId: string,
  patchUsername: string | null | undefined,
  existingUsername: string | null | undefined,
): string {
  if (!isGenericUsername(patchUsername, userId)) {
    return patchUsername!.trim();
  }
  if (!isGenericUsername(existingUsername, userId)) {
    return existingUsername!.trim();
  }
  return userId;
}

function upsertUser(
  map: Map<string, SocialUser>,
  userId: string,
  patch: Partial<SocialUser>,
): void {
  const existing = map.get(userId) ?? withDefaultUser(userId);
  const nextStatus = normalizeSocialStatus(patch.status, {
    status: existing.status,
    isLive: patch.isLive ?? existing.isLive,
    isOnline: patch.isOnline ?? existing.isOnline,
  });
  const next: SocialUser = {
    ...existing,
    ...patch,
    id: userId,
    username: pickBestUsername(userId, patch.username, existing.username),
    avatarUrl: patch.avatarUrl ?? existing.avatarUrl ?? '',
    status: nextStatus,
    isOnline: statusIsOnline(nextStatus),
    isLive: nextStatus === 'live',
  };
  map.set(userId, next);
}

function getSpacetimeUsersFromPublicProfileView(): Map<string, SocialUser> {
  const users = new Map<string, SocialUser>();
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.publicProfileSummary?.iter?.() ?? []);

  for (const row of rows) {
    const userId = asString(row?.userId ?? row?.user_id);
    if (!userId) continue;

    upsertUser(users, userId, {
      username: asString(row?.username) ?? userId,
      avatarUrl: asString(row?.avatarUrl ?? row?.avatar_url) ?? '',
      status: normalizeSocialStatus(row?.status, {
        isLive: false,
        isOnline: false,
      }),
      statusText: '',
      lastSeen: asString(row?.lastSeen ?? row?.last_seen) ?? '',
    });
  }

  return users;
}

type SocialStatusEvent = {
  userId: string;
  status?: SocialPresenceStatus;
  statusText?: string;
  lastSeen?: string;
  username?: string;
  avatarUrl?: string;
  createdAt: number;
};

function getSocialStatusEvents(): Map<string, SocialStatusEvent> {
  const latest = new Map<string, SocialStatusEvent>();
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.globalMessageItem?.iter?.() ?? []);
  rows.sort(
    (a: any, b: any) =>
      readTimestampMs(a?.createdAt ?? a?.created_at) -
      readTimestampMs(b?.createdAt ?? b?.created_at),
  );

  for (const row of rows) {
    const item = parseJsonRecord(row?.item);
    const eventType = asString(item.eventType);

    if (eventType === 'user_profile') {
      const userId = asString(item.userId);
      if (!userId) continue;
      latest.set(userId, {
        userId,
        status: normalizeSocialStatus(item.status ?? item.presenceStatus ?? item.accountStatus, {}),
        username: asString(item.username) ?? asString(item.displayName) ?? undefined,
        avatarUrl: asString(item.avatarUrl) ?? undefined,
        statusText: asString(item.statusText) ?? undefined,
        lastSeen: asString(item.lastSeen) ?? undefined,
        createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
      });
      continue;
    }

    if (eventType === 'social_status') {
      const userId = asString(item.userId);
      const statusRaw = asString(item.status);
      if (!userId || !statusRaw) continue;
      if (
        statusRaw !== 'live' &&
        statusRaw !== 'online' &&
        statusRaw !== 'busy' &&
        statusRaw !== 'offline' &&
        statusRaw !== 'recent'
      ) continue;

      latest.set(userId, {
        userId,
        status: normalizeSocialStatus(statusRaw),
        statusText: asString(item.statusText) ?? undefined,
        lastSeen: asString(item.lastSeen) ?? undefined,
        username: asString(item.username) ?? undefined,
        avatarUrl: asString(item.avatarUrl) ?? undefined,
        createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
      });
      continue;
    }

    // Build user roster from other app-level events.
    if (eventType === 'thread_message') {
      const fromUserId = asString(item.fromUserId);
      const toUserId = asString(item.toUserId);
      const messageRaw =
        item.message && typeof item.message === 'object' ? (item.message as UnknownRecord) : null;
      const fromUsername =
        asString(messageRaw?.user) ??
        asString(item.fromUserName) ??
        undefined;
      if (fromUserId && !latest.has(fromUserId)) {
        latest.set(fromUserId, {
          userId: fromUserId,
          username: fromUsername,
          createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
        });
      }
      if (toUserId && !latest.has(toUserId)) {
        latest.set(toUserId, {
          userId: toUserId,
          createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
        });
      }
      continue;
    }

    if (eventType === 'friend_request' || eventType === 'friend_response') {
      const fromUserId = asString(item.fromUserId);
      const toUserId = asString(item.toUserId);
      if (fromUserId && !latest.has(fromUserId)) {
        latest.set(fromUserId, {
          userId: fromUserId,
          username: asString(item.fromUserName) ?? undefined,
          avatarUrl: asString(item.fromUserAvatar) ?? undefined,
          createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
        });
      }
      if (toUserId && !latest.has(toUserId)) {
        latest.set(toUserId, {
          userId: toUserId,
          username: asString(item.toUserName) ?? undefined,
          avatarUrl: asString(item.toUserAvatar) ?? undefined,
          createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
        });
      }
      continue;
    }

    // Global chat row payloads.
    const senderId = asString(item.senderId);
    if (senderId && !latest.has(senderId)) {
      latest.set(senderId, {
        userId: senderId,
        username: asString(item.user) ?? undefined,
        createdAt: readTimestampMs(row?.createdAt ?? row?.created_at),
      });
    }
  }

  return latest;
}

export function createBackendSocialRepository(
  snapshot: BackendSnapshot,
  client: BackendHttpClient | null,
): SocialRepository {
  return {
    listUsers(request) {
      const usersById = new Map<string, SocialUser>();

      for (const user of snapshot.socialUsers) {
        if (!user?.id) continue;
        upsertUser(usersById, user.id, user);
      }

      for (const [userId, user] of getSpacetimeUsersFromPublicProfileView()) {
        upsertUser(usersById, userId, user);
      }

      const statusEvents = getSocialStatusEvents();
      for (const [userId, event] of statusEvents) {
        const existing = usersById.get(userId) ?? withDefaultUser(userId);
        const nextStatus = normalizeSocialStatus(event.status, {
          status: existing.status,
          isLive: existing.isLive,
          isOnline: existing.isOnline,
        });
        upsertUser(usersById, userId, {
          ...existing,
          status: nextStatus,
          username: event.username ?? existing.username,
          avatarUrl: event.avatarUrl ?? existing.avatarUrl,
          statusText: event.statusText ?? existing.statusText,
          lastSeen:
            event.lastSeen ??
            (nextStatus === 'recent' || nextStatus === 'offline'
              ? new Date(event.createdAt).toISOString()
              : existing.lastSeen),
        });
      }

      let users = Array.from(usersById.values());
      if (users.length === 0 && lastKnownSocialUsers.length > 0) {
        users = lastKnownSocialUsers;
      } else if (users.length > 0) {
        lastKnownSocialUsers = users;
      }

      if (request?.statuses?.length) {
        users = users.filter((user) =>
          request.statuses?.some((status) => {
            const normalizedStatus = normalizeSocialStatus(user.status, {
              isLive: user.isLive,
              isOnline: user.isOnline,
            });
            if (status === 'live') return normalizedStatus === 'live';
            if (status === 'busy') return normalizedStatus === 'busy';
            if (status === 'online') return statusIsOnline(normalizedStatus);
            return !statusIsOnline(normalizedStatus);
          }),
        );
      }

      const searched = filterByQuery(users, request?.query, [
        (user) => user.username,
        (user) => user.statusText,
        (user) => user.lastSeen,
      ]);

      return applyCursorPage(searched, request);
    },
    async updateUserStatus(request) {
      if (!request.userId) return;

      const nowIso = new Date().toISOString();
      const status = normalizeSocialStatus(request.status);
      const nextStatusText = asString(request.statusText);

      try {
        const reducers = spacetimeDb.reducers as any;
        const id = `social-status-${request.userId}-${Date.now()}`;
        if (typeof reducers?.setSocialStatus === 'function') {
          await reducers.setSocialStatus({
            id,
            userId: request.userId,
            status,
            statusText: nextStatusText,
            lastSeen: status === 'recent' || status === 'offline' ? nowIso : null,
            username: null,
            avatarUrl: null,
          });
        } else {
          await reducers.sendGlobalMessage({
            id,
            roomId: `social:${request.userId}`,
            item: JSON.stringify({
              eventType: 'social_status',
              userId: request.userId,
              status,
              isLive: status === 'live',
              isOnline: statusIsOnline(status),
              statusText: nextStatusText ?? undefined,
              lastSeen: status === 'recent' || status === 'offline' ? nowIso : undefined,
            }),
          });
        }
        requestBackendRefresh({
          scopes: ['social', 'friendships'],
          source: 'manual',
          reason: 'social_status_updated_spacetimedb',
        });
        return;
      } catch {
        // Fallback for legacy API deployments.
      }

      await postSafe(client, '/social/update-status', request);
    },
    async setUserLive(request) {
      if (!request.userId) return;

      const status: 'live' | 'online' | 'recent' = request.isLive ? 'live' : 'online';
      try {
        const reducers = spacetimeDb.reducers as any;
        const id = `social-live-${request.userId}-${Date.now()}`;
        if (typeof reducers?.setSocialStatus === 'function') {
          await reducers.setSocialStatus({
            id,
            userId: request.userId,
            status,
            statusText: null,
            lastSeen: request.isLive ? null : new Date().toISOString(),
            username: null,
            avatarUrl: null,
          });
        } else {
          await reducers.sendGlobalMessage({
            id,
            roomId: `social:${request.userId}`,
            item: JSON.stringify({
              eventType: 'social_status',
              userId: request.userId,
              status,
              isLive: request.isLive,
              isOnline: request.isLive || status === 'online',
              lastSeen: request.isLive ? undefined : new Date().toISOString(),
            }),
          });
        }
        requestBackendRefresh({
          scopes: ['social', 'friendships'],
          source: 'manual',
          reason: 'social_live_updated_spacetimedb',
        });
        return;
      } catch {
        // Fallback for legacy API deployments.
      }

      await postSafe(client, '/social/set-live', request);
    },
  };
}
