import type { LeaderboardRepository } from '../../contracts';
import type { LeaderboardItem } from '../../../features/leaderboard/types';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';
import { railwayDb } from '../../../lib/railwayRuntime';

type UserDirectoryEntry = {
  username: string;
  displayName: string;
  avatarUrl: string;
};

type RankedEntry = {
  userId: string;
  score: number;
  cashAmount: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

let lastKnownLeaderboardItems: LeaderboardItem[] = [];

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'bigint') {
    return Math.max(0, Number(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return fallback;
}

function buildUserDirectory(snapshot: BackendSnapshot): Map<string, UserDirectoryEntry> {
  const directory = new Map<string, UserDirectoryEntry>();

  for (const item of snapshot.leaderboardItems) {
    if (!item?.id) continue;
    directory.set(item.id, {
      username: item.username || item.id,
      displayName: item.displayName || item.username || item.id,
      avatarUrl: item.avatarUrl || '',
    });
  }

  for (const user of snapshot.socialUsers) {
    if (!user?.id) continue;
    directory.set(user.id, {
      username: user.username || directory.get(user.id)?.username || user.id,
      displayName:
        directory.get(user.id)?.displayName ||
        user.username ||
        directory.get(user.id)?.username ||
        user.id,
      avatarUrl: user.avatarUrl || directory.get(user.id)?.avatarUrl || '',
    });
  }

  const dbView = railwayDb.db as any;
  const publicRows: any[] = Array.from(
    dbView?.publicProfileSummary?.iter?.() ??
      dbView?.public_profile_summary?.iter?.() ??
      [],
  );

  for (const row of publicRows) {
    const userId = asString(row?.userId ?? row?.user_id);
    if (!userId) continue;
    const username = asString(row?.username) ?? directory.get(userId)?.username ?? userId;
    directory.set(userId, {
      username,
      displayName: directory.get(userId)?.displayName || username,
      avatarUrl: asString(row?.avatarUrl ?? row?.avatar_url) ?? directory.get(userId)?.avatarUrl ?? '',
    });
  }

  return directory;
}

function buildSnapshotItemsById(snapshot: BackendSnapshot): Map<string, LeaderboardItem> {
  const itemsById = new Map<string, LeaderboardItem>();
  for (const item of snapshot.leaderboardItems) {
    if (!item?.id) continue;
    itemsById.set(item.id, item);
  }
  return itemsById;
}

function getAuthoritativeLeaderboardItems(
  snapshot: BackendSnapshot,
  viewerUserId: string | null,
): LeaderboardItem[] {
  const dbView = railwayDb.db as any;
  const rows: any[] = Array.from(
    dbView?.publicLeaderboard?.iter?.() ?? dbView?.public_leaderboard?.iter?.() ?? [],
  );
  if (rows.length === 0) {
    return [];
  }

  const snapshotItemsById = buildSnapshotItemsById(snapshot);
  const directory = buildUserDirectory(snapshot);

  const rankedEntries = rows
    .map<RankedEntry | null>((row) => {
      const userId = asString(row?.userId ?? row?.user_id);
      if (!userId) return null;

      const score = asNonNegativeInt(row?.score, asNonNegativeInt(row?.gold));
      const cashAmount = asNonNegativeInt(row?.gold, score);

      return {
        userId,
        score,
        cashAmount,
        username: asString(row?.username),
        displayName: asString(row?.displayName ?? row?.display_name),
        avatarUrl: asString(row?.avatarUrl ?? row?.avatar_url),
      };
    })
    .filter((entry): entry is RankedEntry => Boolean(entry))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.cashAmount - left.cashAmount ||
        left.userId.localeCompare(right.userId),
    );

  return rankedEntries.map((entry, index) => {
    const snapshotItem = snapshotItemsById.get(entry.userId);
    const directoryEntry = directory.get(entry.userId);
    const username =
      entry.username || directoryEntry?.username || snapshotItem?.username || entry.userId;
    const displayName =
      entry.displayName || snapshotItem?.displayName || directoryEntry?.displayName || username;
    const avatarUrl =
      entry.avatarUrl || directoryEntry?.avatarUrl || snapshotItem?.avatarUrl || '';

    return {
      id: entry.userId,
      rank: index + 1,
      displayName,
      username,
      avatarUrl,
      cashAmount: entry.cashAmount,
      isCurrentUser: viewerUserId != null ? entry.userId === viewerUserId : snapshotItem?.isCurrentUser,
      isFriend: snapshotItem?.isFriend,
    };
  });
}

export function createBackendLeaderboardRepository(
  snapshot: BackendSnapshot,
  viewerUserId: string | null = null,
): LeaderboardRepository {
  return {
    listLeaderboardItems(request) {
      const authoritativeItems = getAuthoritativeLeaderboardItems(snapshot, viewerUserId);

      let items =
        authoritativeItems.length > 0
          ? authoritativeItems
          : snapshot.leaderboardItems.length > 0
            ? snapshot.leaderboardItems
            : lastKnownLeaderboardItems;

      if (authoritativeItems.length > 0 || snapshot.leaderboardItems.length > 0) {
        lastKnownLeaderboardItems = items;
      }

      if (request?.includeCurrentUser === false) {
        items = items.filter(
          (item) => !item.isCurrentUser && (!viewerUserId || item.id !== viewerUserId),
        );
      }

      const searched = filterByQuery(items, request?.query, [
        (item) => item.displayName,
        (item) => item.username,
      ]);

      return applyCursorPage(searched, request);
    },
  };
}
