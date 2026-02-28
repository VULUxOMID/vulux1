import {
  type ListArtistsResponse,
  type ListAcceptedFriendIdsResponse,
  type ListBoostLeaderboardResponse,
  type ListConversationsResponse,
  type ListGlobalMessagesResponse,
  type ListKnownLiveUsersResponse,
  type ListLivePresenceResponse,
  type ListLeaderboardItemsResponse,
  type ListLivesResponse,
  type ListMentionUsersResponse,
  type ListNotificationsResponse,
  type ListPlaylistsResponse,
  type ListSearchIndexResponse,
  type ListSocialUsersResponse,
  type ListThreadSeedMessagesResponse,
  type ListTracksResponse,
  type ListVideosResponse,
} from '../../contracts';
import type { BackendHttpClient } from './httpClient';

type UnknownRecord = Record<string, unknown>;
const SNAPSHOT_PATCH_ENDPOINT_RETRY_MS = 5 * 60_000;
let snapshotPatchEndpointUnavailableUntilMs = 0;
let snapshotPatchEndpointWarningLogged = false;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function isMissingSnapshotPatchRoute(error: unknown): boolean {
  if (error instanceof Error) {
    return /404/.test(error.message);
  }
  if (isRecord(error) && typeof error.message === 'string') {
    return /404/.test(error.message);
  }
  return false;
}

function normalizeSearchIndex(
  rawPayload: unknown,
  fallback: Pick<BackendSnapshot, 'socialUsers' | 'conversations' | 'lives'>,
): ListSearchIndexResponse {
  const payload = safeRecord(rawPayload);
  if (payload) {
    return {
      users: safeArray<ListSearchIndexResponse['users'][number]>(payload.users),
      conversations: safeArray<ListSearchIndexResponse['conversations'][number]>(
        payload.conversations,
      ),
      lives: safeArray<ListSearchIndexResponse['lives'][number]>(payload.lives),
    };
  }

  return {
    users: fallback.socialUsers,
    conversations: fallback.conversations,
    lives: fallback.lives,
  };
}

function getSnapshotPayload(raw: unknown): UnknownRecord {
  const payload = safeRecord(raw);
  if (!payload) return {};
  const nestedSnapshot = safeRecord(payload.snapshot);
  return nestedSnapshot ?? payload;
}

function hasOwn(payload: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function parseThreadSeedMessagesByUserId(
  value: unknown,
): Record<string, ListThreadSeedMessagesResponse> {
  const threadSeedPayload = safeRecord(value);
  if (!threadSeedPayload) return {};

  return Object.entries(threadSeedPayload).reduce<Record<string, ListThreadSeedMessagesResponse>>(
    (acc, [userId, messages]) => {
      acc[userId] = safeArray<ListThreadSeedMessagesResponse[number]>(messages);
      return acc;
    },
    {},
  );
}

export type BackendSnapshot = {
  lives: ListLivesResponse;
  boostLeaderboard: ListBoostLeaderboardResponse;
  knownLiveUsers: ListKnownLiveUsersResponse;
  livePresence: ListLivePresenceResponse;
  socialUsers: ListSocialUsersResponse;
  acceptedFriendIds: ListAcceptedFriendIdsResponse;
  conversations: ListConversationsResponse;
  globalMessages: ListGlobalMessagesResponse;
  mentionUsers: ListMentionUsersResponse;
  threadSeedMessagesByUserId: Record<string, ListThreadSeedMessagesResponse>;
  notifications: ListNotificationsResponse;
  leaderboardItems: ListLeaderboardItemsResponse;
  videos: ListVideosResponse;
  tracks: ListTracksResponse;
  playlists: ListPlaylistsResponse;
  artists: ListArtistsResponse;
  searchIndex: ListSearchIndexResponse;
  wallet?: Record<string, unknown>;
};

export type BackendSnapshotPatch = Partial<Omit<BackendSnapshot, 'searchIndex'>> & {
  searchIndex?: ListSearchIndexResponse;
  wallet?: Record<string, unknown>;
};

export type BackendSnapshotScope =
  | 'messages'
  | 'mention_users'
  | 'conversations'
  | 'global_messages'
  | 'notifications'
  | 'social'
  | 'friendships'
  | 'live'
  | 'leaderboard'
  | 'videos'
  | 'music'
  | 'search'
  | 'wallet';

export const BACKEND_PATCHABLE_SCOPES: readonly BackendSnapshotScope[] = [
  'messages',
  'mention_users',
  'conversations',
  'global_messages',
  'notifications',
  'social',
  'friendships',
  'live',
  'leaderboard',
  'videos',
  'music',
  'search',
  'wallet',
];

export const EMPTY_BACKEND_SNAPSHOT: BackendSnapshot = {
  lives: [],
  boostLeaderboard: [],
  knownLiveUsers: [],
  livePresence: [],
  socialUsers: [],
  acceptedFriendIds: [],
  conversations: [],
  globalMessages: [],
  mentionUsers: [],
  threadSeedMessagesByUserId: {},
  notifications: [],
  leaderboardItems: [],
  videos: [],
  tracks: [],
  playlists: [],
  artists: [],
  searchIndex: {
    users: [],
    conversations: [],
    lives: [],
  },
};

export async function loadBackendSnapshot(
  client: BackendHttpClient | null,
): Promise<BackendSnapshot> {
  return loadBackendSnapshotForUser(client, null);
}

export async function loadBackendSnapshotForUser(
  client: BackendHttpClient | null,
  viewerUserId: string | null = null,
): Promise<BackendSnapshot> {
  if (!client) {
    if (__DEV__) {
      console.warn(
        '[data/backend] EXPO_PUBLIC_API_BASE_URL is missing. Using empty data snapshot.',
      );
    }
    return EMPTY_BACKEND_SNAPSHOT;
  }

  try {
    const rawPayload = await client.get<unknown>(
      '/snapshot',
      viewerUserId ? { userId: viewerUserId } : undefined,
    );
    const payload = getSnapshotPayload(rawPayload);

    const lives = safeArray<ListLivesResponse[number]>(payload.lives);
    const boostLeaderboard = safeArray<ListBoostLeaderboardResponse[number]>(
      payload.boostLeaderboard,
    );
    const knownLiveUsers = safeArray<ListKnownLiveUsersResponse[number]>(payload.knownLiveUsers);
    const livePresence = safeArray<ListLivePresenceResponse[number]>(payload.livePresence);
    const socialUsers = safeArray<ListSocialUsersResponse[number]>(payload.socialUsers);
    const acceptedFriendIds = safeArray<ListAcceptedFriendIdsResponse[number]>(
      payload.acceptedFriendIds,
    );
    const conversations = safeArray<ListConversationsResponse[number]>(payload.conversations);
    const globalMessages = safeArray<ListGlobalMessagesResponse[number]>(payload.globalMessages);
    const mentionUsers = safeArray<ListMentionUsersResponse[number]>(payload.mentionUsers);
    const notifications = safeArray<ListNotificationsResponse[number]>(payload.notifications);
    const leaderboardItems = safeArray<ListLeaderboardItemsResponse[number]>(
      payload.leaderboardItems,
    );
    const videos = safeArray<ListVideosResponse[number]>(payload.videos);
    const tracks = safeArray<ListTracksResponse[number]>(payload.tracks);
    const playlists = safeArray<ListPlaylistsResponse[number]>(payload.playlists);
    const artists = safeArray<ListArtistsResponse[number]>(payload.artists);

    const threadSeedMessagesByUserId = parseThreadSeedMessagesByUserId(
      payload.threadSeedMessagesByUserId,
    );

    const wallet = safeRecord(payload.wallet) ?? undefined;

    return {
      ...EMPTY_BACKEND_SNAPSHOT,
      lives,
      boostLeaderboard,
      knownLiveUsers,
      livePresence,
      socialUsers,
      acceptedFriendIds,
      conversations,
      globalMessages,
      mentionUsers,
      notifications,
      leaderboardItems,
      videos,
      tracks,
      playlists,
      artists,
      threadSeedMessagesByUserId,
      searchIndex: normalizeSearchIndex(payload.searchIndex, {
        socialUsers,
        conversations,
        lives,
      }),
      wallet,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[data/backend] Failed to load backend snapshot', error);
    }
    return EMPTY_BACKEND_SNAPSHOT;
  }
}

export async function loadBackendSnapshotPatchForUser(
  client: BackendHttpClient | null,
  _viewerUserId: string | null,
  scopes: string[],
): Promise<BackendSnapshotPatch | null> {
  if (!client) return null;
  if (Date.now() < snapshotPatchEndpointUnavailableUntilMs) {
    return null;
  }

  const normalizedScopes = Array.from(
    new Set(scopes.map((scope) => scope.trim()).filter(Boolean)),
  );
  if (normalizedScopes.length === 0) return null;

  try {
    const rawPayload = await client.get<unknown>('/snapshot/patch', { scopes: normalizedScopes });
    const payload = getSnapshotPayload(rawPayload);
    const patchPayload = safeRecord(payload.patch) ?? payload;
    const patch: BackendSnapshotPatch = {};

    if (hasOwn(patchPayload, 'lives')) {
      patch.lives = safeArray<ListLivesResponse[number]>(patchPayload.lives);
    }
    if (hasOwn(patchPayload, 'boostLeaderboard')) {
      patch.boostLeaderboard = safeArray<ListBoostLeaderboardResponse[number]>(
        patchPayload.boostLeaderboard,
      );
    }
    if (hasOwn(patchPayload, 'knownLiveUsers')) {
      patch.knownLiveUsers = safeArray<ListKnownLiveUsersResponse[number]>(
        patchPayload.knownLiveUsers,
      );
    }
    if (hasOwn(patchPayload, 'livePresence')) {
      patch.livePresence = safeArray<ListLivePresenceResponse[number]>(patchPayload.livePresence);
    }
    if (hasOwn(patchPayload, 'socialUsers')) {
      patch.socialUsers = safeArray<ListSocialUsersResponse[number]>(patchPayload.socialUsers);
    }
    if (hasOwn(patchPayload, 'acceptedFriendIds')) {
      patch.acceptedFriendIds = safeArray<ListAcceptedFriendIdsResponse[number]>(
        patchPayload.acceptedFriendIds,
      );
    }
    if (hasOwn(patchPayload, 'conversations')) {
      patch.conversations = safeArray<ListConversationsResponse[number]>(patchPayload.conversations);
    }
    if (hasOwn(patchPayload, 'globalMessages')) {
      patch.globalMessages = safeArray<ListGlobalMessagesResponse[number]>(
        patchPayload.globalMessages,
      );
    }
    if (hasOwn(patchPayload, 'mentionUsers')) {
      patch.mentionUsers = safeArray<ListMentionUsersResponse[number]>(patchPayload.mentionUsers);
    }
    if (hasOwn(patchPayload, 'threadSeedMessagesByUserId')) {
      patch.threadSeedMessagesByUserId = parseThreadSeedMessagesByUserId(
        patchPayload.threadSeedMessagesByUserId,
      );
    }
    if (hasOwn(patchPayload, 'notifications')) {
      patch.notifications = safeArray<ListNotificationsResponse[number]>(patchPayload.notifications);
    }
    if (hasOwn(patchPayload, 'leaderboardItems')) {
      patch.leaderboardItems = safeArray<ListLeaderboardItemsResponse[number]>(
        patchPayload.leaderboardItems,
      );
    }
    if (hasOwn(patchPayload, 'videos')) {
      patch.videos = safeArray<ListVideosResponse[number]>(patchPayload.videos);
    }
    if (hasOwn(patchPayload, 'tracks')) {
      patch.tracks = safeArray<ListTracksResponse[number]>(patchPayload.tracks);
    }
    if (hasOwn(patchPayload, 'playlists')) {
      patch.playlists = safeArray<ListPlaylistsResponse[number]>(patchPayload.playlists);
    }
    if (hasOwn(patchPayload, 'artists')) {
      patch.artists = safeArray<ListArtistsResponse[number]>(patchPayload.artists);
    }
    if (hasOwn(patchPayload, 'searchIndex')) {
      patch.searchIndex = normalizeSearchIndex(patchPayload.searchIndex, {
        socialUsers: patch.socialUsers ?? EMPTY_BACKEND_SNAPSHOT.socialUsers,
        conversations: patch.conversations ?? EMPTY_BACKEND_SNAPSHOT.conversations,
        lives: patch.lives ?? EMPTY_BACKEND_SNAPSHOT.lives,
      });
    }
    if (hasOwn(patchPayload, 'wallet')) {
      patch.wallet = safeRecord(patchPayload.wallet) ?? undefined;
    }

    return patch;
  } catch (error) {
    if (isMissingSnapshotPatchRoute(error)) {
      snapshotPatchEndpointUnavailableUntilMs = Date.now() + SNAPSHOT_PATCH_ENDPOINT_RETRY_MS;
      if (__DEV__ && !snapshotPatchEndpointWarningLogged) {
        snapshotPatchEndpointWarningLogged = true;
        console.warn(
          '[data/backend] /snapshot/patch is unavailable on backend; using full snapshot fallback',
        );
      }
      return null;
    }
    if (__DEV__) {
      console.warn('[data/backend] Failed to load backend snapshot patch', error);
    }
    return null;
  }
}

export function mergeBackendSnapshot(
  base: BackendSnapshot,
  patch: BackendSnapshotPatch,
): BackendSnapshot {
  const merged: BackendSnapshot = {
    ...base,
    ...patch,
    threadSeedMessagesByUserId:
      patch.threadSeedMessagesByUserId ?? base.threadSeedMessagesByUserId,
    searchIndex: normalizeSearchIndex(patch.searchIndex, {
      socialUsers: patch.socialUsers ?? base.socialUsers,
      conversations: patch.conversations ?? base.conversations,
      lives: patch.lives ?? base.lives,
    }),
  };

  return merged;
}
