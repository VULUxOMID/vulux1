import type { LeaderboardItem } from './types';

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CurrentUserSeed = {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

type CurrentUserProfileSeed = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
};

type CurrentUserLabels = {
  displayName: string;
  username: string;
  avatarUrl: string;
};

type BuildCurrentUserPreviewInput = {
  currentUserEntry: LeaderboardItem | null;
  user: CurrentUserSeed | null;
  userProfile: CurrentUserProfileSeed;
  cashAmount: number;
};

type BuildVisibleLeaderboardItemsInput = {
  scope: 'all' | 'friends' | 'me';
  isPublic: boolean;
  searchQuery: string;
  leaderboardData: LeaderboardItem[];
  currentUserPreview: LeaderboardItem | null;
  currentUserId: string | null;
  acceptedFriendIds: ReadonlySet<string>;
};

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readEmailHandle(email: string | null | undefined): string | null {
  const normalized = normalizeString(email);
  if (!normalized || !normalized.includes('@')) {
    return null;
  }
  const localPart = normalized.split('@')[0]?.trim() ?? '';
  return localPart.length > 0 ? localPart : null;
}

function looksLikeOpaqueUserLabel(value: string | null | undefined, userId?: string | null): boolean {
  const normalized = normalizeString(value);
  if (!normalized) {
    return true;
  }
  if (UUID_LIKE_PATTERN.test(normalized)) {
    return true;
  }
  return Boolean(userId && normalized.toLowerCase() === userId.trim().toLowerCase());
}

function sanitizeHandle(value: string | null | undefined): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const collapsed = normalized.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  const candidate = collapsed.trim();
  return candidate.length > 0 ? candidate : null;
}

export function deriveCurrentUserLabels(
  user: CurrentUserSeed | null,
  userProfile: CurrentUserProfileSeed,
): CurrentUserLabels {
  const userId = normalizeString(user?.uid) ?? normalizeString(userProfile.id);
  const emailHandle = readEmailHandle(user?.email);
  const profileUsername = normalizeString(userProfile.username);
  const profileName = normalizeString(userProfile.name);
  const displayName = normalizeString(user?.displayName);

  const resolvedDisplayName =
    (!looksLikeOpaqueUserLabel(profileName, userId) && profileName) ||
    (!looksLikeOpaqueUserLabel(displayName, userId) && displayName) ||
    (!looksLikeOpaqueUserLabel(profileUsername, userId) && profileUsername) ||
    (!looksLikeOpaqueUserLabel(emailHandle, userId) && emailHandle) ||
    'You';

  const resolvedUsername =
    (!looksLikeOpaqueUserLabel(profileUsername, userId) && sanitizeHandle(profileUsername)) ||
    (!looksLikeOpaqueUserLabel(emailHandle, userId) && sanitizeHandle(emailHandle)) ||
    sanitizeHandle(resolvedDisplayName) ||
    'you';

  return {
    displayName: resolvedDisplayName,
    username: resolvedUsername,
    avatarUrl: normalizeString(userProfile.avatarUrl) ?? normalizeString(user?.photoURL) ?? '',
  };
}

export function buildCurrentUserPreviewEntry({
  currentUserEntry,
  user,
  userProfile,
  cashAmount,
}: BuildCurrentUserPreviewInput): LeaderboardItem | null {
  const currentUserId = normalizeString(user?.uid) ?? normalizeString(userProfile.id);
  if (!currentUserId) {
    return null;
  }

  const labels = deriveCurrentUserLabels(user, userProfile);
  return {
    id: currentUserId,
    rank: currentUserEntry?.rank ?? 0,
    displayName: labels.displayName,
    username: labels.username,
    avatarUrl: labels.avatarUrl,
    cashAmount: currentUserEntry?.cashAmount ?? Math.max(0, Math.floor(cashAmount)),
    isCurrentUser: true,
    isFriend: false,
  };
}

export function buildVisibleLeaderboardItems({
  scope,
  isPublic,
  searchQuery,
  leaderboardData,
  currentUserPreview,
  currentUserId,
  acceptedFriendIds,
}: BuildVisibleLeaderboardItemsInput): LeaderboardItem[] {
  const isCurrentUser = (item: LeaderboardItem) =>
    item.isCurrentUser || (currentUserId != null && item.id === currentUserId);

  let items =
    scope === 'me'
      ? currentUserPreview
        ? [currentUserPreview]
        : []
      : scope === 'friends'
        ? leaderboardData.filter((item) => acceptedFriendIds.has(item.id))
        : leaderboardData;

  if (!isPublic && scope !== 'me') {
    items = items.filter((item) => !isCurrentUser(item));
  }

  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return items;
  }

  return items.filter((item) => {
    const displayName = item.displayName.toLowerCase();
    const username = item.username.toLowerCase();
    return displayName.includes(query) || username.includes(query);
  });
}

export function getMeScopeSummary(
  currentUserPreview: LeaderboardItem | null,
  isPublic: boolean,
): string {
  const rankText =
    currentUserPreview && currentUserPreview.rank > 0
      ? `Your current rank is #${currentUserPreview.rank}.`
      : 'Your leaderboard row is syncing from the live snapshot.';

  if (!isPublic) {
    return `${rankText} You are hidden from other players.`;
  }

  return rankText;
}
