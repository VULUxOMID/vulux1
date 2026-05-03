import type { NotificationsRepository } from '../../contracts';
import { applyCursorPage } from './query';
import type { BackendSnapshot } from './snapshot';
import type { BackendHttpClient } from './httpClient';
import { getRailwayAuthSnapshot, railwayDb } from '../../../lib/railwayRuntime';
import { requestBackendRefresh } from './refreshBus';
import { readCurrentAuthAccessToken } from '../../../auth/currentAuthAccessToken';
import { getConfiguredBackendBaseUrl } from '../../../config/backendBaseUrl';

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

const locallyReadNotificationIdsByViewer = new Map<string, Set<string>>();
const locallyDeletedNotificationIdsByViewer = new Map<string, Set<string>>();

function notificationViewerKey(viewerUserId: string | null | undefined): string {
  const normalized = viewerUserId?.trim();
  return normalized && normalized.length > 0 ? normalized : '__anonymous__';
}

function getScopedNotificationIds(
  store: Map<string, Set<string>>,
  viewerUserId: string | null | undefined,
): Set<string> {
  const key = notificationViewerKey(viewerUserId);
  const existing = store.get(key);
  if (existing) {
    return existing;
  }
  const next = new Set<string>();
  store.set(key, next);
  return next;
}

function normalizeBackendBaseUrl(): string {
  return getConfiguredBackendBaseUrl().trim().replace(/\/+$/, '');
}

async function postSocialBackend(path: string, payload: UnknownRecord): Promise<void> {
  const baseUrl = normalizeBackendBaseUrl();
  const token = asString(await readCurrentAuthAccessToken());
  if (!baseUrl || !token) {
    throw new Error('Railway social backend is unavailable.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(getRailwayAuthSnapshot().userId
        ? { 'X-Vulu-User-Id': getRailwayAuthSnapshot().userId as string }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Social backend write failed (${response.status})`);
  }
}

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
  options: { includeRuntimeEvents?: boolean; includePublicProfileView?: boolean } = {},
): Map<string, UserDirectoryEntry> {
  const users = new Map<string, UserDirectoryEntry>();
  const dbView = railwayDb.db as any;
  const includeRuntimeEvents = options.includeRuntimeEvents !== false;
  const includePublicProfileView = options.includePublicProfileView ?? fallbackUsers.length === 0;

  if (includePublicProfileView) {
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
  }

  if (includeRuntimeEvents) {
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
  const dbView = railwayDb.db as any;
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

function buildFriendRequestStateMapFromSnapshot(
  notifications: BackendSnapshot['notifications'],
  viewerUserId: string,
): Map<string, FriendRequestState> {
  const states = new Map<string, FriendRequestState>();
  for (const notification of notifications) {
    if (notification.type !== 'friend_request') continue;
    const otherUserId = asString(notification.fromUser?.id);
    if (!otherUserId) continue;
    const direction = notification.direction ?? 'received';
    const fromUserId = direction === 'sent' ? viewerUserId : otherUserId;
    const toUserId = direction === 'sent' ? otherUserId : viewerUserId;
    const pairKey = buildPairKey(fromUserId, toUserId);
    states.set(notification.id, {
      requestId: notification.id,
      pairKey,
      fromUserId,
      toUserId,
      status:
        notification.status === 'accepted'
          ? 'accepted'
          : notification.status === 'declined'
            ? 'declined'
            : 'pending',
      createdAt: notification.createdAt,
      updatedAt: notification.createdAt,
      fromUserName: direction === 'sent' ? undefined : notification.fromUser.name,
      fromUserAvatar: direction === 'sent' ? undefined : notification.fromUser.avatar,
      toUserName: direction === 'sent' ? notification.fromUser.name : undefined,
      toUserAvatar: direction === 'sent' ? notification.fromUser.avatar : undefined,
    });
  }
  return states;
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

function findSnapshotNotificationById(
  snapshot: BackendSnapshot,
  notificationId: string,
): BackendSnapshot['notifications'][number] | null {
  return snapshot.notifications.find((item) => item.id === notificationId) ?? null;
}

function isPersistableAppNotification(
  notification: BackendSnapshot['notifications'][number] | null,
): boolean {
  return Boolean(notification && notification.type !== 'friend_request');
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
  const locallyReadNotificationIds = getScopedNotificationIds(
    locallyReadNotificationIdsByViewer,
    viewerUserId,
  );
  const locallyDeletedNotificationIds = getScopedNotificationIds(
    locallyDeletedNotificationIdsByViewer,
    viewerUserId,
  );

  return {
    listNotifications(request) {
      const userDirectory = buildKnownUserDirectory(fallbackUsers, {
        includeRuntimeEvents: !snapshot.socialReadLoaded,
      });
      const snapshotItems = snapshot.notifications.filter((item) => {
        if (locallyDeletedNotificationIds.has(item.id)) return false;
        if (isFriendRemovalNotification(item)) return false;
        return true;
      });
      const statesByRequestId =
        snapshot.socialReadLoaded && viewerUserId
          ? buildFriendRequestStateMapFromSnapshot(snapshotItems, viewerUserId)
          : new Map<string, FriendRequestState>();
      const friendRequestStates =
        snapshot.socialReadLoaded && viewerUserId
          ? getLatestFriendRequestStatesByPair(statesByRequestId, viewerUserId)
          : [];
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

      items = items.map((item) =>
        locallyReadNotificationIds.has(item.id)
          ? {
              ...item,
              read: true,
            }
          : item,
      );

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
      const existingSnapshotNotification = findSnapshotNotificationById(snapshot, request.notificationId);
      const shouldPersist =
        snapshot.socialReadLoaded && isPersistableAppNotification(existingSnapshotNotification);
      const wasAlreadyRead = locallyReadNotificationIds.has(request.notificationId);
      locallyReadNotificationIds.add(request.notificationId);
      requestBackendRefresh({
        scopes: ['notifications', 'counts'],
        source: 'manual',
        reason: 'notification_mark_read_local',
      });
      if (!shouldPersist) {
        return;
      }
      try {
        await postSocialBackend('/api/social/notifications/read', {
          notificationId: request.notificationId,
          updatedAtIsoUtc: new Date().toISOString(),
        });
      } catch (error) {
        if (!wasAlreadyRead) {
          locallyReadNotificationIds.delete(request.notificationId);
          requestBackendRefresh({
            scopes: ['notifications', 'counts'],
            source: 'manual',
            reason: 'notification_mark_read_rollback',
          });
        }
        if (__DEV__) {
          console.warn('[data/notifications] Failed to persist notification read via backend', error);
        }
        throw error instanceof Error ? error : new Error('Failed to persist notification read.');
      }
    },
    async markAllRead() {
      const newlyReadIds: string[] = [];
      if (snapshot.socialReadLoaded) {
        for (const item of snapshot.notifications) {
          if (!locallyReadNotificationIds.has(item.id)) {
            newlyReadIds.push(item.id);
          }
          locallyReadNotificationIds.add(item.id);
        }
      } else {
        const states = buildFriendRequestStateMap(
          buildKnownUserDirectory(fallbackUsers, {
            includeRuntimeEvents: !snapshot.socialReadLoaded,
          }),
        );
        for (const state of states.values()) {
          if (state.fromUserId === viewerUserId || state.toUserId === viewerUserId) {
            if (!locallyReadNotificationIds.has(state.requestId)) {
              newlyReadIds.push(state.requestId);
            }
            locallyReadNotificationIds.add(state.requestId);
          }
        }
      }
      requestBackendRefresh({
        scopes: ['notifications', 'counts'],
        source: 'manual',
        reason: 'notification_mark_all_read_local',
      });
      if (!snapshot.socialReadLoaded) {
        return;
      }
      const persistableIds = snapshot.notifications
        .filter((item) => item.type !== 'friend_request' && !locallyDeletedNotificationIds.has(item.id))
        .map((item) => item.id);
      if (persistableIds.length === 0) {
        return;
      }
      try {
        await postSocialBackend('/api/social/notifications/read-all', {
          notificationIds: persistableIds,
          updatedAtIsoUtc: new Date().toISOString(),
        });
      } catch (error) {
        for (const id of newlyReadIds) {
          locallyReadNotificationIds.delete(id);
        }
        requestBackendRefresh({
          scopes: ['notifications', 'counts'],
          source: 'manual',
          reason: 'notification_mark_all_read_rollback',
        });
        if (__DEV__) {
          console.warn('[data/notifications] Failed to persist mark-all-read via backend', error);
        }
        throw error instanceof Error ? error : new Error('Failed to persist mark-all-read.');
      }
    },
    async deleteNotification(request) {
      if (!request.notificationId) return;
      const existingSnapshotNotification = findSnapshotNotificationById(snapshot, request.notificationId);
      const shouldPersist =
        snapshot.socialReadLoaded && isPersistableAppNotification(existingSnapshotNotification);
      const wasAlreadyDeleted = locallyDeletedNotificationIds.has(request.notificationId);
      locallyDeletedNotificationIds.add(request.notificationId);
      requestBackendRefresh({
        scopes: ['notifications', 'counts'],
        source: 'manual',
        reason: 'notification_delete_local',
      });
      if (!shouldPersist) {
        return;
      }
      try {
        await postSocialBackend('/api/social/notifications/delete', {
          notificationId: request.notificationId,
          deletedAtIsoUtc: new Date().toISOString(),
        });
      } catch (error) {
        if (!wasAlreadyDeleted) {
          locallyDeletedNotificationIds.delete(request.notificationId);
          requestBackendRefresh({
            scopes: ['notifications', 'counts'],
            source: 'manual',
            reason: 'notification_delete_rollback',
          });
        }
        if (__DEV__) {
          console.warn('[data/notifications] Failed to persist notification delete via backend', error);
        }
        throw error instanceof Error ? error : new Error('Failed to persist notification delete.');
      }
    },
    async respondToFriendRequest(request) {
      if (!request.notificationId || !viewerUserId) {
        throw new Error('Viewer identity is required to respond to a friend request.');
      }

      const userDirectory = buildKnownUserDirectory(fallbackUsers, {
        includeRuntimeEvents: !snapshot.socialReadLoaded,
      });
      const actorProfile = userDirectory.get(viewerUserId);
      const state =
        (snapshot.socialReadLoaded
          ? buildFriendRequestStateMapFromSnapshot(snapshot.notifications, viewerUserId).get(
              request.notificationId,
            )
          : buildFriendRequestStateMap(userDirectory).get(request.notificationId)) ??
        findFriendRequestStateInNotificationTable(request.notificationId, viewerUserId, userDirectory);
      if (!state) {
        throw new Error('Friend request state was not found in Railway.');
      }

      const toUserId = state.fromUserId === viewerUserId ? state.toUserId : state.fromUserId;
      const backendPayload = {
        notificationId: state.requestId,
        requestId: state.requestId,
        pairKey: state.pairKey,
        fromUserId: viewerUserId,
        toUserId,
        status: request.status,
        fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? null,
        fromUserAvatar: actorProfile?.avatarUrl ?? null,
        toUserName:
          toUserId === state.toUserId ? state.toUserName ?? null : state.fromUserName ?? null,
        toUserAvatar:
          toUserId === state.toUserId ? state.toUserAvatar ?? null : state.fromUserAvatar ?? null,
        updatedAtIsoUtc: new Date().toISOString(),
      } satisfies UnknownRecord;

      try {
        await postSocialBackend('/api/social/friend-response', backendPayload);
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/notifications] Failed to persist friend response via backend', error);
        }
        throw error instanceof Error ? error : new Error('Failed to persist friend response.');
      }
      requestBackendRefresh({
        scopes: ['notifications', 'friendships', 'social', 'counts'],
        source: 'manual',
        reason: 'friend_request_response_backend_only',
      });
      return;
    },
    async sendFriendRequest(request) {
      if (!request.toUserId) return;

      const fromUserId = asString(request.fromUserId) ?? viewerUserId;
      if (!fromUserId || fromUserId === request.toUserId) {
        return;
      }

      const pairKey = buildPairKey(fromUserId, request.toUserId);
      const userDirectory = buildKnownUserDirectory(fallbackUsers, {
        includeRuntimeEvents: !snapshot.socialReadLoaded,
      });
      const actorProfile = userDirectory.get(fromUserId);
      const targetProfile = userDirectory.get(request.toUserId);
      const statesByRequestId =
        snapshot.socialReadLoaded
          ? buildFriendRequestStateMapFromSnapshot(snapshot.notifications, fromUserId)
          : buildFriendRequestStateMap(userDirectory);
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
      const backendPayload = {
        id: requestId,
        requestId,
        pairKey,
        fromUserId,
        toUserId: request.toUserId,
        fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? null,
        fromUserAvatar: actorProfile?.avatarUrl ?? null,
        toUserName: targetProfile?.displayName ?? targetProfile?.username ?? null,
        toUserAvatar: targetProfile?.avatarUrl ?? null,
        createdAt: new Date().toISOString(),
      } satisfies UnknownRecord;

      try {
        await postSocialBackend('/api/social/friend-request', backendPayload);
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/notifications] Failed to persist friend request via backend', error);
        }
        throw error instanceof Error ? error : new Error('Failed to persist friend request.');
      }
      requestBackendRefresh({
        scopes: ['notifications', 'friendships', 'counts'],
        source: 'manual',
        reason: 'friend_request_sent_backend_only',
      });
      return;
    },
    async removeFriendRelationship(request) {
      if (!request.otherUserId) return;

      const actorUserId = asString(request.userId) ?? viewerUserId;
      if (!actorUserId) {
        throw new Error('Viewer identity is required to remove a friend relationship.');
      }

      const pairKey = buildPairKey(actorUserId, request.otherUserId);
      const userDirectory = buildKnownUserDirectory(fallbackUsers, {
        includeRuntimeEvents: !snapshot.socialReadLoaded,
      });
      const actorProfile = userDirectory.get(actorUserId);
      const targetProfile = userDirectory.get(request.otherUserId);
      const relatedRequests = Array.from(
        (
          snapshot.socialReadLoaded
            ? buildFriendRequestStateMapFromSnapshot(snapshot.notifications, actorUserId)
            : buildFriendRequestStateMap(userDirectory)
        ).values(),
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
      const backendPayload = {
        requestId: relatedRequest?.requestId ?? null,
        pairKey,
        fromUserId: actorUserId,
        toUserId: request.otherUserId,
        fromUserName: actorProfile?.displayName ?? actorProfile?.username ?? null,
        fromUserAvatar: actorProfile?.avatarUrl ?? null,
        toUserName: targetProfile?.displayName ?? targetProfile?.username ?? null,
        toUserAvatar: targetProfile?.avatarUrl ?? null,
        updatedAtIsoUtc: new Date().toISOString(),
      } satisfies UnknownRecord;

      try {
        await postSocialBackend('/api/social/friend-remove', backendPayload);
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/notifications] Failed to persist friend removal via backend', error);
        }
        throw error instanceof Error ? error : new Error('Failed to persist friend removal.');
      }
      if (canceledPendingRequestId) {
        locallyDeletedNotificationIds.add(canceledPendingRequestId);
      }
      requestBackendRefresh({
        scopes: ['notifications', 'friendships', 'social', 'counts'],
        source: 'manual',
        reason: 'friend_relationship_removed_backend_only',
      });
      return;
    },
  };
}
