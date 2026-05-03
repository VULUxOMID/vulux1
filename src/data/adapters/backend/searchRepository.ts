import type {
  ListSearchIndexResponse,
  SearchRepository,
} from '../../contracts';
import { filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';

function readSnapshotSearchIndex(snapshot: BackendSnapshot): ListSearchIndexResponse {
  const users =
    snapshot.searchIndex.users.length > 0 ? snapshot.searchIndex.users : snapshot.socialUsers;
  const conversations =
    snapshot.searchIndex.conversations.length > 0
      ? snapshot.searchIndex.conversations
      : snapshot.conversations;
  const lives =
    snapshot.searchIndex.lives.length > 0 ? snapshot.searchIndex.lives : snapshot.lives;

  return {
    users,
    conversations,
    lives,
  };
}

export function createBackendSearchRepository(
  snapshot: BackendSnapshot,
  _viewerUserId: string | null = null,
): SearchRepository {
  return {
    listIndex(request) {
      const liveIndex = readSnapshotSearchIndex(snapshot);

      const baseIndex: ListSearchIndexResponse = {
        users: liveIndex.users,
        conversations: liveIndex.conversations,
        lives: liveIndex.lives,
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
