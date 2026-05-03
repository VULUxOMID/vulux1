import type { Repositories } from '../../contracts';
import { createBackendLeaderboardRepository } from './leaderboardRepository';
import { createBackendLiveRepository } from './liveRepository';
import { createBackendMessagesRepository } from './messagesRepository';
import { createBackendMusicCatalogRepository } from './musicCatalogRepository';
import { createBackendNotificationsRepository } from './notificationsRepository';
import { createBackendFriendshipsRepository } from './friendshipsRepository';
import { createBackendSearchRepository } from './searchRepository';
import { createBackendSocialRepository } from './socialRepository';
import { createBackendVideoRepository } from './videoRepository';
import {
  BACKEND_PATCHABLE_SCOPES,
  EMPTY_BACKEND_SNAPSHOT,
  loadBackendMediaSnapshot,
  loadBackendMessagesSnapshot,
  loadBackendSocialSnapshotForUser,
  mergeBackendSnapshot,
  type BackendSnapshot,
  loadBackendSnapshot,
  loadBackendSnapshotPatchForUser,
  loadBackendSnapshotForUser,
} from './snapshot';
import type { BackendHttpClient } from './httpClient';

export {
  BACKEND_PATCHABLE_SCOPES,
  EMPTY_BACKEND_SNAPSHOT,
  loadBackendMediaSnapshot,
  loadBackendMessagesSnapshot,
  loadBackendSocialSnapshotForUser,
  loadBackendSnapshot,
  loadBackendSnapshotForUser,
  loadBackendSnapshotPatchForUser,
  mergeBackendSnapshot,
};

export function createBackendRepositories(
  snapshot: BackendSnapshot = EMPTY_BACKEND_SNAPSHOT,
  client: BackendHttpClient | null = null,
  viewerUserId: string | null = null,
): Repositories {
  return {
    live: createBackendLiveRepository(snapshot),
    social: createBackendSocialRepository(snapshot, client),
    friendships: createBackendFriendshipsRepository(snapshot, viewerUserId),
    messages: createBackendMessagesRepository(snapshot, client, viewerUserId),
    notifications: createBackendNotificationsRepository(snapshot, client, viewerUserId),
    leaderboard: createBackendLeaderboardRepository(snapshot, viewerUserId),
    video: createBackendVideoRepository(snapshot),
    musicCatalog: createBackendMusicCatalogRepository(snapshot),
    search: createBackendSearchRepository(snapshot, viewerUserId),
  };
}
