import type { FriendshipsRepository } from '../../contracts';
import type { BackendSnapshot } from './snapshot';

export function createBackendFriendshipsRepository(
  snapshot: BackendSnapshot,
  _viewerUserId: string | null = null,
): FriendshipsRepository {
  return {
    listAcceptedFriendIds() {
      return snapshot.acceptedFriendIds;
    },
  };
}
