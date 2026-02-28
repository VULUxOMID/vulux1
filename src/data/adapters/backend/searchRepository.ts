import type {
  Conversation,
  ListSearchIndexResponse,
  SearchRepository,
  SocialUser,
} from '../../contracts';
import type { LiveItem } from '../../../features/home/LiveSection';
import { filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';
import { spacetimeDb } from '../../../lib/spacetime';

type UnknownRecord = Record<string, unknown>;
let lastKnownSearchUsers: SocialUser[] = [];
let lastKnownSearchConversations: Conversation[] = [];
let lastKnownSearchLives: LiveItem[] = [];

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

function withDefaultUser(userId: string): SocialUser {
  return {
    id: userId,
    username: userId,
    avatarUrl: '',
    isOnline: false,
    isLive: false,
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

function upsertUser(map: Map<string, SocialUser>, userId: string, patch: Partial<SocialUser>): void {
  const existing = map.get(userId) ?? withDefaultUser(userId);
  map.set(userId, {
    ...existing,
    ...patch,
    id: userId,
    username: pickBestUsername(userId, patch.username, existing.username),
    avatarUrl: patch.avatarUrl ?? existing.avatarUrl ?? '',
    isOnline: patch.isOnline ?? existing.isOnline ?? false,
    isLive: patch.isLive ?? existing.isLive ?? false,
  });
}

function getGlobalRowsSortedAsc(): any[] {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.globalMessageItem?.iter?.() ?? []);
  rows.sort(
    (a, b) =>
      readTimestampMs(a?.createdAt ?? a?.created_at) -
      readTimestampMs(b?.createdAt ?? b?.created_at),
  );
  return rows;
}

function getSpacetimeUsers(snapshot: BackendSnapshot): SocialUser[] {
  const usersById = new Map<string, SocialUser>();
  for (const user of snapshot.socialUsers) {
    if (!user?.id) continue;
    usersById.set(user.id, user);
  }

  const dbView = spacetimeDb.db as any;
  const publicRows: any[] = Array.from(dbView?.publicProfileSummary?.iter?.() ?? []);
  for (const row of publicRows) {
    const userId = asString(row?.userId ?? row?.user_id);
    if (!userId) continue;
    upsertUser(usersById, userId, {
      username: asString(row?.username) ?? userId,
      avatarUrl: asString(row?.avatarUrl ?? row?.avatar_url) ?? '',
      statusText: '',
      lastSeen: '',
      isOnline: false,
      isLive: false,
    });
  }

  const globalRows = getGlobalRowsSortedAsc();
  for (const row of globalRows) {
    const item = parseJsonRecord(row?.item);
    const eventType = asString(item.eventType);
    if (eventType === 'user_profile') {
      const userId = asString(item.userId);
      if (!userId) continue;
      upsertUser(usersById, userId, {
        username: asString(item.username) ?? asString(item.displayName) ?? userId,
        avatarUrl: asString(item.avatarUrl) ?? '',
        statusText: asString(item.statusText) ?? '',
        isOnline: true,
      });
      continue;
    }

    const senderId = asString(item.senderId);
    if (senderId) {
      upsertUser(usersById, senderId, {
        username: asString(item.user) ?? usersById.get(senderId)?.username ?? senderId,
        isOnline: true,
      });
    }

    if (eventType === 'thread_message') {
      const fromUserId = asString(item.fromUserId);
      const toUserId = asString(item.toUserId);
      const messageRaw =
        item.message && typeof item.message === 'object' ? (item.message as UnknownRecord) : null;
      if (fromUserId) {
        upsertUser(usersById, fromUserId, {
          username:
            asString(messageRaw?.user) ??
            asString(item.fromUserName) ??
            usersById.get(fromUserId)?.username ??
            fromUserId,
          isOnline: true,
        });
      }
      if (toUserId) {
        upsertUser(usersById, toUserId, {
          username: asString(item.toUserName) ?? usersById.get(toUserId)?.username ?? toUserId,
        });
      }
    }
  }

  return Array.from(usersById.values());
}

function buildConversationKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('::');
}

function getSpacetimeConversations(
  snapshot: BackendSnapshot,
  viewerUserId: string | null,
): Conversation[] {
  if (!viewerUserId) {
    return snapshot.conversations;
  }

  const byOtherUser = new Map<string, Conversation>();
  for (const conversation of snapshot.conversations) {
    byOtherUser.set(conversation.otherUserId, conversation);
  }

  const rows = getGlobalRowsSortedAsc();
  for (const row of rows) {
    const item = parseJsonRecord(row?.item);
    if (asString(item.eventType) !== 'thread_message') continue;

    const fromUserId = asString(item.fromUserId);
    const toUserId = asString(item.toUserId);
    if (!fromUserId || !toUserId) continue;
    if (fromUserId !== viewerUserId && toUserId !== viewerUserId) continue;

    const otherUserId = fromUserId === viewerUserId ? toUserId : fromUserId;
    const messageRaw =
      item.message && typeof item.message === 'object' ? (item.message as UnknownRecord) : null;
    if (!messageRaw) continue;

    const createdAt =
      asFiniteNumber(messageRaw.createdAt) ??
      readTimestampMs(row?.createdAt ?? row?.created_at);
    const senderId = fromUserId === viewerUserId ? 'me' : fromUserId;
    byOtherUser.set(otherUserId, {
      id: buildConversationKey(viewerUserId, otherUserId),
      otherUserId,
      unreadCount: 0,
      lastMessage: {
        id: asString(messageRaw.id) ?? `msg-${createdAt}`,
        senderId,
        text: asString(messageRaw.text) ?? '',
        createdAt: new Date(createdAt).toISOString(),
      },
    });
  }

  return Array.from(byOtherUser.values()).sort(
    (a, b) => Date.parse(b.lastMessage.createdAt) - Date.parse(a.lastMessage.createdAt),
  );
}

function parseSpacetimeLives(snapshot: BackendSnapshot): LiveItem[] {
  const byId = new Map<string, LiveItem>();
  for (const live of snapshot.lives) {
    if (!live?.id) continue;
    byId.set(live.id, live);
  }

  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.publicLiveDiscovery?.iter?.() ?? []);
  for (const row of rows) {
    const id = asString(row?.liveId ?? row?.live_id);
    if (!id) continue;

    const hostUserId = asString(row?.hostUserId ?? row?.host_user_id);
    const hostUsername = asString(row?.hostUsername ?? row?.host_username);
    const hostAvatarUrl = asString(row?.hostAvatarUrl ?? row?.host_avatar_url);

    const host = hostAvatarUrl
      ? {
          id: hostUserId ?? undefined,
          username: hostUsername ?? undefined,
          name: hostUsername ?? hostUserId ?? 'Host',
          age: 0,
          country: '',
          bio: '',
          verified: false,
          avatar: hostAvatarUrl,
        }
      : null;

    const existing = byId.get(id);

    byId.set(id, {
      id,
      title: asString(row?.title) ?? existing?.title ?? 'Live',
      viewers: Math.max(0, Math.floor(asFiniteNumber(row?.viewerCount ?? row?.viewer_count) ?? 0)),
      boosted: existing?.boosted ?? false,
      images: host ? [host.avatar] : existing?.images ?? [],
      hosts: host ? [host] : existing?.hosts ?? [],
    });
  }

  return Array.from(byId.values());
}

export function createBackendSearchRepository(
  snapshot: BackendSnapshot,
  viewerUserId: string | null = null,
): SearchRepository {
  return {
    listIndex(request) {
      const liveUsers = getSpacetimeUsers(snapshot);
      const liveConversations = getSpacetimeConversations(snapshot, viewerUserId);
      const liveLives = parseSpacetimeLives(snapshot);

      const users =
        liveUsers.length > 0
          ? liveUsers
          : lastKnownSearchUsers.length > 0
            ? lastKnownSearchUsers
            : liveUsers;
      const conversations =
        liveConversations.length > 0
          ? liveConversations
          : lastKnownSearchConversations.length > 0
            ? lastKnownSearchConversations
            : liveConversations;
      const lives =
        liveLives.length > 0
          ? liveLives
          : lastKnownSearchLives.length > 0
            ? lastKnownSearchLives
            : liveLives;

      if (liveUsers.length > 0) {
        lastKnownSearchUsers = liveUsers;
      }
      if (liveConversations.length > 0) {
        lastKnownSearchConversations = liveConversations;
      }
      if (liveLives.length > 0) {
        lastKnownSearchLives = liveLives;
      }

      const baseIndex: ListSearchIndexResponse = {
        users,
        conversations,
        lives,
      };

      if (!request?.query) {
        return baseIndex;
      }

      return {
        users: filterByQuery(baseIndex.users, request.query, [
          (user) => user.username,
          (user) => user.statusText,
        ]),
        conversations: filterByQuery(baseIndex.conversations, request.query, [
          (conversation) => conversation.otherUserId,
          (conversation) => conversation.lastMessage.text,
        ]),
        lives: filterByQuery(baseIndex.lives, request.query, [
          (live) => live.title,
          (live) => live.hosts.map((host) => host.name),
        ]),
      };
    },
  };
}
