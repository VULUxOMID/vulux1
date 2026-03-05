import type { NotificationsRepository } from '../../contracts';
import { applyCursorPage } from './query';
import type { BackendSnapshot } from './snapshot';
import type { BackendHttpClient } from './httpClient';
import { spacetimeDb } from '../../../lib/spacetime';
import { requestBackendRefresh } from './refreshBus';

type UnknownRecord = Record<string, unknown>;

type FriendRequestState = {
  requestId: string;
  pairKey: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'removed';
  createdAt: number;
  updatedAt: number;
  fromUserName?: string;
  fromUserAvatar?: string;
  toUserName?: string;
  toUserAvatar?: string;
};

type UserDirectoryEntry = {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  updatedAt: number;
};

const locallyReadNotificationIds = new Set<string>();
const locallyDeletedNotificationIds = new Set<string>();

function isFriendRemovalMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return /removed the friend connection/i.test(text.trim());
}

function isFriendRemovalMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const eventType = asString((metadata as UnknownRecord).eventType);
  return eventType === 'friend_removed';
}

function isFriendRemovalActivityItem(item: UnknownRecord): boolean {
  const type = asString(item.type);
  if (type === 'friend_request') {
    return asString(item.status) === 'removed';
  }
  if (isFriendRemovalMetadata(item.metadata)) {
    return true;
  }
  return isFriendRemovalMessage(asString(item.message));
}

function isFriendRemovalNotification(
  notification: BackendSnapshot['notifications'][number],
): boolean {
  if (notification.type === 'friend_request') {
    return (notification.status as string) === 'removed';
  }
  if (notification.type !== 'activity') {
    return false;
  }
  if (isFriendRemovalMetadata(notification.metadata)) {
    return true;
  }
  return isFriendRemovalMessage(notification.message);
}

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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
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

function isIdentityLikeName(userId: string, value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  if (normalized === userId.toLowerCase()) return true;
  if (normalized === 'user' || normalized === 'unknown-user') return true;
  if (/^user_[a-z0-9]{10,}$/i.test(trimmed)) return true;
  return false;
}

function upsertUserDirectoryEntry(
  map: Map<string, UserDirectoryEntry>,
  userId: string,
  patch: Partial<UserDirectoryEntry>,
  updatedAt: number,
): void {
  const existing = map.get(userId);
  if (!existing || updatedAt >= existing.updatedAt) {
    map.set(userId, {
      userId,
      username: patch.username ?? existing?.username,
      displayName: patch.displayName ?? existing?.displayName,
      avatarUrl: patch.avatarUrl ?? existing?.avatarUrl,
      updatedAt,
    });
  }
}

function buildKnownUserDirectory(
  fallbackUsers: Array<{ id: string; username?: string; avatarUrl?: string }> = [],
): Map<string, UserDirectoryEntry> {
  const users = new Map<string, UserDirectoryEntry>();
  const dbView = spacetimeDb.db as any;

  const publicRows: any[] = Array.from(dbView?.publicProfileSummary?.iter?.() ?? []);
  for (const row of publicRows) {
    const userId = asString(row?.userId ?? row?.user_id);
    if (!userId) continue;
    const updatedAt = Date.now();
    upsertUserDirectoryEntry(
      users,
      userId,
      {
        username: asString(row?.username) ?? undefined,
        displayName: asString(row?.username) ?? undefined,
        avatarUrl: asString(row?.avatarUrl ?? row?.avatar_url) ?? undefined,
      },
      updatedAt,
    );
  }

  const globalRows: any[] = Array.from(dbView?.globalMessageItem?.iter?.() ?? []);
  for (const row of globalRows) {
    const item = parseJsonRecord(row?.item);
    const eventType = asString(item.eventType);
    const updatedAt = readTimestampMs(row?.createdAt ?? row?.created_at);

    if (eventType === 'user_profile') {
      const userId = asString(item.userId);
      if (!userId) continue;
      upsertUserDirectoryEntry(
        users,
        userId,
        {
          username: asString(item.username) ?? undefined,
          displayName: asString(item.displayName) ?? undefined,
          avatarUrl: asString(item.avatarUrl) ?? undefined,
        },
        updatedAt,
      );
      continue;
    }

    const fromUserId = asString(item.fromUserId);
    if (fromUserId) {
      upsertUserDirectoryEntry(
        users,
        fromUserId,
        {
          username: asString(item.fromUserName) ?? undefined,
          avatarUrl: asString(item.fromUserAvatar) ?? undefined,
        },
        updatedAt,
      );
    }

    const toUserId = asString(item.toUserId);
    if (toUserId) {
      upsertUserDirectoryEntry(
        users,
        toUserId,
        {
          username: asString(item.toUserName) ?? undefined,
          avatarUrl: asString(item.toUserAvatar) ?? undefined,
        },
        updatedAt,
      );
    }
  }

  for (const user of fallbackUsers) {
    const userId = asString(user?.id);
    if (!userId) continue;
    upsertUserDirectoryEntry(
      users,
      userId,
      {
        username: asString(user?.username) ?? undefined,
        avatarUrl: asString(user?.avatarUrl) ?? undefined,
      },
      0,
    );
  }

  return users;
}

function resolveUserName(
  userId: string,
  explicitName: string | null | undefined,
  fallbackName: string | null | undefined,
  directory: Map<string, UserDirectoryEntry>,
): string {
  const known = directory.get(userId);
  const explicit = explicitName?.trim();
  if (explicit && !isIdentityLikeName(userId, explicit)) return explicit;

  const fallback = fallbackName?.trim();
  if (fallback && !isIdentityLikeName(userId, fallback)) return fallback;

  const displayName = known?.displayName?.trim();
  if (displayName && !isIdentityLikeName(userId, displayName)) return displayName;

  const username = known?.username?.trim();
  if (username && !isIdentityLikeName(userId, username)) return username;

  return explicit || fallback || userId;
}

function resolveUserAvatar(
  userId: string,
  explicitAvatar: string | null | undefined,
  fallbackAvatar: string | null | undefined,
  directory: Map<string, UserDirectoryEntry>,
): string | undefined {
  const explicit = explicitAvatar?.trim();
  if (explicit) return explicit;
  const fallback = fallbackAvatar?.trim();
  if (fallback) return fallback;
  return directory.get(userId)?.avatarUrl;
}

function buildFriendRequestStateMap(
  userDirectory: Map<string, UserDirectoryEntry>,
): Map<string, FriendRequestState> {
  const map = new Map<string, FriendRequestState>();
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
    if (
      eventType !== 'friend_request' &&
      eventType !== 'friend_response' &&
      eventType !== 'friend_removed'
    ) {
      continue;
    }

    const fromUserId = asString(item.fromUserId);
    const toUserId = asString(item.toUserId);
    if (!fromUserId || !toUserId) continue;

    const requestId = asString(item.requestId) ?? asString(row?.id) ?? '';
    if (!requestId) continue;

    const pairKey = asString(item.pairKey) ?? buildPairKey(fromUserId, toUserId);
    const createdAt = readTimestampMs(row?.createdAt ?? row?.created_at);
    const existing = map.get(requestId);
    const base: FriendRequestState = existing ?? {
      requestId,
      pairKey,
      fromUserId,
      toUserId,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    };
    const fromUserName = resolveUserName(
      fromUserId,
      asString(item.fromUserName),
      base.fromUserName,
      userDirectory,
    );
    const toUserName = resolveUserName(
      toUserId,
      asString(item.toUserName),
      base.toUserName,
      userDirectory,
    );
    const fromUserAvatar = resolveUserAvatar(
      fromUserId,
      asString(item.fromUserAvatar),
      base.fromUserAvatar,
      userDirectory,
    );
    const toUserAvatar = resolveUserAvatar(
      toUserId,
      asString(item.toUserAvatar),
      base.toUserAvatar,
      userDirectory,
    );

    if (eventType === 'friend_removed') {
      map.set(requestId, {
        ...base,
        pairKey,
        fromUserId: base.fromUserId,
        toUserId: base.toUserId,
        status: 'removed',
        updatedAt: createdAt,
        fromUserName,
        toUserName,
        fromUserAvatar,
        toUserAvatar,
      });
      continue;
    }

    if (eventType === 'friend_request') {
      map.set(requestId, {
        ...base,
        pairKey,
        fromUserId,
        toUserId,
        status: 'pending',
        updatedAt: createdAt,
        fromUserName,
        fromUserAvatar,
        toUserName,
        toUserAvatar,
      });
      continue;
    }

    const responseStatus = asString(item.status) === 'accepted' ? 'accepted' : 'declined';
    map.set(requestId, {
      ...base,
      pairKey,
      fromUserId: base.fromUserId,
      toUserId: base.toUserId,
      status: responseStatus,
      updatedAt: createdAt,
      fromUserName,
      fromUserAvatar,
      toUserName,
      toUserAvatar,
    });
  }

  return map;
}

function getLatestFriendRequestStatesByPair(
  statesByRequestId: Map<string, FriendRequestState>,
  viewerUserId: string,
): FriendRequestState[] {
  const latestByPair = new Map<string, FriendRequestState>();
  for (const state of statesByRequestId.values()) {
    if (state.fromUserId !== viewerUserId && state.toUserId !== viewerUserId) continue;
    const existing = latestByPair.get(state.pairKey);
    if (!existing || state.updatedAt > existing.updatedAt) {
      latestByPair.set(state.pairKey, state);
      continue;
    }
    if (existing.updatedAt === state.updatedAt && state.requestId > existing.requestId) {
      latestByPair.set(state.pairKey, state);
    }
  }
  return Array.from(latestByPair.values());
}

function findFriendRequestStateInNotificationTable(
  notificationId: string,
  viewerUserId: string,
  userDirectory: Map<string, UserDirectoryEntry>,
): FriendRequestState | null {
  void notificationId;
  void viewerUserId;
  void userDirectory;
  // notificationItem is private in schema. Fallback to backend snapshot only.
  return null;
}

function readNotificationRowsFromTable(
  viewerUserId: string | null,
  userDirectory: Map<string, UserDirectoryEntry>,
): BackendSnapshot['notifications'] {
  const rows: any[] = Array.from(
    (spacetimeDb.db as any)?.myNotifications?.iter?.() ??
      (spacetimeDb.db as any)?.my_notifications?.iter?.() ??
      [],
  );
  const mapped: BackendSnapshot['notifications'] = [];

  for (const row of rows) {
    const item = parseJsonRecord(row?.item);
    const id = asString(item.id) ?? asString(row?.id);
    if (!id) continue;

    const rowUserId = asString(row?.userId ?? row?.user_id);
    if (viewerUserId && rowUserId && rowUserId !== viewerUserId) {
      continue;
    }

    const type = asString(item.type);
    if (!type) continue;

    const createdAt = readTimestampMs(item.createdAt ?? row?.createdAt ?? row?.created_at);
    const read = asBoolean(item.read) ?? false;

    if (type === 'profile_view') {
      const rawViewer = item.viewer as UnknownRecord | undefined;
      const viewerId = asString(rawViewer?.id);
      if (!viewerId) continue;

      const resolvedViewerName = resolveUserName(
        viewerId,
        asString(rawViewer?.name),
        undefined,
        userDirectory,
      );
      const resolvedViewerAvatar = resolveUserAvatar(
        viewerId,
        asString(rawViewer?.avatar),
        undefined,
        userDirectory,
      );
      const viewCount = Math.max(1, Math.floor(asFiniteNumber(item.viewCount) ?? 1));
      const lastViewed = readTimestampMs(item.lastViewed ?? item.createdAt ?? createdAt);

      mapped.push({
        id,
        type: 'profile_view',
        createdAt,
        read,
        viewer: {
          id: viewerId,
          name: resolvedViewerName,
          avatar: resolvedViewerAvatar ?? undefined,
          level: Math.max(0, Math.floor(asFiniteNumber(rawViewer?.level) ?? 0)),
        },
        viewCount,
        lastViewed,
      });
      continue;
    }

    if (type === 'activity') {
      const rawFromUser = item.fromUser as UnknownRecord | undefined;
      const fromUserId = asString(rawFromUser?.id);
      mapped.push({
        id,
        type: 'activity',
        createdAt,
        read,
        activityType:
          (asString(item.activityType) as
            | 'mention'
            | 'reply'
            | 'event'
            | 'money_received'
            | 'live_invite'
            | 'other') ?? 'other',
        fromUser: fromUserId
          ? {
              id: fromUserId,
              name: resolveUserName(
                fromUserId,
                asString(rawFromUser?.name),
                undefined,
                userDirectory,
              ),
              avatar: resolveUserAvatar(
                fromUserId,
                asString(rawFromUser?.avatar),
                undefined,
                userDirectory,
              ),
            }
          : undefined,
        message: asString(item.message) ?? '',
        metadata:
          item.metadata && typeof item.metadata === 'object'
            ? (item.metadata as Record<string, unknown>)
            : undefined,
      });
      continue;
    }

    if (type === 'announcement') {
      mapped.push({
        id,
        type: 'announcement',
        createdAt,
        read,
        title: asString(item.title) ?? 'Announcement',
        message: asString(item.message) ?? '',
        sourceName: asString(item.sourceName) ?? 'Vulu',
        priority:
          (asString(item.priority) as 'low' | 'medium' | 'high') ?? 'low',
      });
    }
  }

  return mapped;
}

export function createBackendNotificationsRepository(
  snapshot: BackendSnapshot,
  _client: BackendHttpClient | null,
  viewerUserId: string | null = null,
): NotificationsRepository {
  const fallbackUsers = snapshot.socialUsers.map((user) => ({
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
  }));

  return {
    listNotifications(request) {
      const userDirectory = buildKnownUserDirectory(fallbackUsers);
      const snapshotItems = snapshot.notifications.filter((item) => {
        if (locallyDeletedNotificationIds.has(item.id)) return false;
        if (isFriendRemovalNotification(item)) return false;
        return true;
      });
      const tableItems = readNotificationRowsFromTable(viewerUserId, userDirectory).filter(
        (item) => !locallyDeletedNotificationIds.has(item.id),
      );
      const statesByRequestId = buildFriendRequestStateMap(userDirectory);
      const friendRequestStates =
        viewerUserId ? getLatestFriendRequestStatesByPair(statesByRequestId, viewerUserId) : [];
      const latestRemovedPairKeys = new Set(
        friendRequestStates
          .filter((state) => state.status === 'removed')
          .map((state) => state.pairKey),
      );
      const derivedItems: typeof snapshot.notifications =
        viewerUserId
          ? friendRequestStates
              .filter((state) => {
                if (state.status === 'removed') return false;
                return !locallyDeletedNotificationIds.has(state.requestId);
              })
              .map((state) => {
                const direction: 'sent' | 'received' =
                  state.fromUserId === viewerUserId ? 'sent' : 'received';
                const otherUserId = direction === 'sent' ? state.toUserId : state.fromUserId;
                const otherUserName =
                  direction === 'sent'
                    ? state.toUserName ?? otherUserId
                    : state.fromUserName ?? otherUserId;
                const otherAvatar =
                  direction === 'sent'
                    ? state.toUserAvatar
                    : state.fromUserAvatar;
                const isRead =
                  state.status !== 'pending' || locallyReadNotificationIds.has(state.requestId);

                return {
                  id: state.requestId,
                  type: 'friend_request' as const,
                  createdAt: state.updatedAt,
                  read: isRead,
                  direction,
                  status: state.status === 'removed' ? 'declined' : state.status,
                  fromUser: {
                    id: otherUserId,
                    name: otherUserName,
                    avatar: otherAvatar,
                    level: 0,
                  },
                };
              })
          : [];

      const byId = new Map<string, (typeof snapshotItems)[number]>();
      for (const item of snapshotItems) {
        byId.set(item.id, item);
      }
      for (const item of tableItems) {
        byId.set(item.id, item);
      }
      for (const item of derivedItems) {
        byId.set(item.id, item);
      }

      let items = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
      if (viewerUserId) {
        if (latestRemovedPairKeys.size > 0) {
          items = items.filter((item) => {
            if (item.type !== 'friend_request') return true;
            const pairKey = buildPairKey(viewerUserId, item.fromUser.id);
            return !latestRemovedPairKeys.has(pairKey);
          });
        }

        const dedupedFriendRequests = new Map<string, (typeof items)[number]>();
        const nonFriendRequests: (typeof items)[number][] = [];
        for (const item of items) {
          if (item.type !== 'friend_request') {
            nonFriendRequests.push(item);
            continue;
          }
          const key = `fr:${item.fromUser.id}:${item.direction ?? 'received'}`;
          const existing = dedupedFriendRequests.get(key);
          if (!existing || item.createdAt > existing.createdAt) {
            dedupedFriendRequests.set(key, item);
          }
        }
        items = [...nonFriendRequests, ...dedupedFriendRequests.values()].sort(
          (a, b) => b.createdAt - a.createdAt,
        );
      }

      if (request?.unreadOnly) {
        items = items.filter((item) => !item.read);
      }
      if (request?.types?.length) {
        items = items.filter((item) => request.types?.includes(item.type));
      }

      return applyCursorPage(items, request);
    },
    async markRead(request) {
      if (!request.notificationId) return;
      locallyReadNotificationIds.add(request.notificationId);
      requestBackendRefresh({
        scopes: ['notifications', 'counts'],
        source: 'manual',
        reason: 'notification_mark_read_local',
      });
    },
    async markAllRead() {
      const states = buildFriendRequestStateMap(buildKnownUserDirectory(fallbackUsers));
      for (const state of states.values()) {
        if (state.fromUserId === viewerUserId || state.toUserId === viewerUserId) {
          locallyReadNotificationIds.add(state.requestId);
        }
      }
      requestBackendRefresh({
        scopes: ['notifications', 'counts'],
        source: 'manual',
        reason: 'notification_mark_all_read_local',
      });
    },
    async deleteNotification(request) {
      if (!request.notificationId) return;
      locallyDeletedNotificationIds.add(request.notificationId);
      requestBackendRefresh({
        scopes: ['notifications', 'counts'],
        source: 'manual',
        reason: 'notification_delete_local',
      });
    },
    async respondToFriendRequest(request) {
      if (!request.notificationId || !viewerUserId) {
        throw new Error('Viewer identity is required to respond to a friend request.');
      }

      const userDirectory = buildKnownUserDirectory(fallbackUsers);
      const actorProfile = userDirectory.get(viewerUserId);
      const state =
        buildFriendRequestStateMap(userDirectory).get(request.notificationId) ??
        findFriendRequestStateInNotificationTable(request.notificationId, viewerUserId, userDirectory);
      if (!state) {
        throw new Error('Friend request state was not found in SpacetimeDB.');
      }

      const toUserId = state.fromUserId === viewerUserId ? state.toUserId : state.fromUserId;
      try {
        const reducers = spacetimeDb.reducers as any;
        const id = `friend-response-${state.requestId}-${Date.now()}`;
        if (typeof reducers?.respondToFriendRequest === 'function') {
          await reducers.respondToFriendRequest({
            id,
            requestId: state.requestId,
            pairKey: state.pairKey,
            fromUserId: viewerUserId,
            toUserId,
            status: request.status,
            fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? null,
            fromUserAvatar: actorProfile?.avatarUrl ?? null,
          });
        } else {
          await reducers.sendGlobalMessage({
            id,
            roomId: `friend:${state.pairKey}`,
            item: JSON.stringify({
              eventType: 'friend_response',
              requestId: state.requestId,
              pairKey: state.pairKey,
              fromUserId: viewerUserId,
              toUserId,
              status: request.status,
              fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? undefined,
              fromUserAvatar: actorProfile?.avatarUrl ?? undefined,
            }),
          });
        }
        requestBackendRefresh({
          scopes: ['notifications', 'friendships', 'social', 'counts'],
          source: 'manual',
          reason: 'friend_request_response_spacetimedb',
        });
        return;
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/notifications] Failed to respond to friend request via SpacetimeDB', error);
        }
        throw error instanceof Error ? error : new Error('Failed to respond to friend request.');
      }
    },
    async sendFriendRequest(request) {
      if (!request.toUserId) return;

      const fromUserId = asString(request.fromUserId) ?? viewerUserId;
      if (!fromUserId || fromUserId === request.toUserId) {
        return;
      }

      const pairKey = buildPairKey(fromUserId, request.toUserId);
      const userDirectory = buildKnownUserDirectory(fallbackUsers);
      const actorProfile = userDirectory.get(fromUserId);
      const targetProfile = userDirectory.get(request.toUserId);
      const statesByRequestId = buildFriendRequestStateMap(userDirectory);
      const latestForPair = Array.from(statesByRequestId.values())
        .filter((state) => state.pairKey === pairKey)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const existingPending =
        latestForPair &&
        latestForPair.status === 'pending'
          ? latestForPair
          : null;
      if (existingPending) {
        requestBackendRefresh({
          scopes: ['notifications', 'friendships', 'counts'],
          source: 'manual',
          reason:
            existingPending.fromUserId === fromUserId
              ? 'friend_request_pending_already_exists'
              : 'friend_request_pending_incoming_exists',
        });
        return;
      }
      const requestId = `friend-request-${fromUserId}-${request.toUserId}-${Date.now()}`;
      try {
        const reducers = spacetimeDb.reducers as any;
        if (typeof reducers?.sendFriendRequest === 'function') {
          await reducers.sendFriendRequest({
            id: requestId,
            fromUserId,
            toUserId: request.toUserId,
            fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? null,
            fromUserAvatar: actorProfile?.avatarUrl ?? null,
          });
        } else {
          await reducers.sendGlobalMessage({
            id: requestId,
            roomId: `friend:${pairKey}`,
            item: JSON.stringify({
              eventType: 'friend_request',
              requestId,
              pairKey,
              fromUserId,
              fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? undefined,
              fromUserAvatar: actorProfile?.avatarUrl ?? undefined,
              toUserId: request.toUserId,
              toUserName: targetProfile?.displayName ?? targetProfile?.username ?? undefined,
              toUserAvatar: targetProfile?.avatarUrl ?? undefined,
            }),
          });
        }
        requestBackendRefresh({
          scopes: ['notifications', 'friendships', 'counts'],
          source: 'manual',
          reason: 'friend_request_sent_spacetimedb',
        });
        return;
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/notifications] Failed to send friend request via SpacetimeDB', error);
        }
        throw error instanceof Error ? error : new Error('Failed to send friend request.');
      }
    },
    async removeFriendRelationship(request) {
      if (!request.otherUserId) return;

      const actorUserId = asString(request.userId) ?? viewerUserId;
      if (!actorUserId) {
        throw new Error('Viewer identity is required to remove a friend relationship.');
      }

      const pairKey = buildPairKey(actorUserId, request.otherUserId);
      const userDirectory = buildKnownUserDirectory(fallbackUsers);
      const actorProfile = userDirectory.get(actorUserId);
      const targetProfile = userDirectory.get(request.otherUserId);
      const relatedRequests = Array.from(
        buildFriendRequestStateMap(userDirectory).values(),
      )
        .filter((state) => state.pairKey === pairKey)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const relatedRequest =
        relatedRequests.find(
          (state) => state.status === 'pending' && state.fromUserId === actorUserId,
        ) ??
        relatedRequests.find((state) => state.status === 'pending') ??
        relatedRequests[0];
      const canceledPendingRequestId =
        relatedRequest?.status === 'pending' ? relatedRequest.requestId : null;
      try {
        const reducers = spacetimeDb.reducers as any;
        const id = `friend-remove-${pairKey}-${Date.now()}`;
        if (typeof reducers?.removeFriendRelationship === 'function') {
          await reducers.removeFriendRelationship({
            id,
            pairKey,
            fromUserId: actorUserId,
            toUserId: request.otherUserId,
            fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? null,
            fromUserAvatar: actorProfile?.avatarUrl ?? null,
          });
        } else {
          await reducers.sendGlobalMessage({
            id,
            roomId: `friend:${pairKey}`,
            item: JSON.stringify({
              eventType: 'friend_removed',
              requestId: relatedRequest?.requestId ?? undefined,
              pairKey,
              fromUserId: actorUserId,
              fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? undefined,
              fromUserAvatar: actorProfile?.avatarUrl ?? undefined,
              toUserId: request.otherUserId,
              toUserName: targetProfile?.displayName ?? targetProfile?.username ?? undefined,
              toUserAvatar: targetProfile?.avatarUrl ?? undefined,
            }),
          });
        }
        if (canceledPendingRequestId) {
          locallyDeletedNotificationIds.add(canceledPendingRequestId);
        }
        requestBackendRefresh({
          scopes: ['notifications', 'friendships', 'social', 'counts'],
          source: 'manual',
          reason: 'friend_relationship_removed_spacetimedb',
        });
        return;
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/notifications] Failed to remove friend relationship via SpacetimeDB', error);
        }
        throw error instanceof Error ? error : new Error('Failed to remove friend relationship.');
      }
    },
  };
}
