import type { LeaderboardRepository } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';

export function createBackendLeaderboardRepository(
  snapshot: BackendSnapshot,
): LeaderboardRepository {
  return {
    listLeaderboardItems(request) {
      let items = snapshot.leaderboardItems;
      if (request?.includeCurrentUser === false) {
        items = items.filter((item) => !item.isCurrentUser);
      }

      const searched = filterByQuery(items, request?.query, [
        (item) => item.displayName,
        (item) => item.username,
      ]);

      return applyCursorPage(searched, request);
    },
  };
}
