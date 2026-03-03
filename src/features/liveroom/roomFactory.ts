import type { LiveItem } from '../home/LiveSection';
import type { LiveRoom, LiveUser } from './types';
import { liveSessionUser } from './liveSession';

type CreateRoomFromLiveOptions = {
  inviteOnly?: boolean;
  initialBoostRank?: number | null;
  initialBoosts?: number;
  hostUserOverride?: LiveUser;
};

function cloneUser(user: LiveUser): LiveUser {
  return {
    ...user,
    roles: user.roles ? [...user.roles] : undefined,
    currentTrack: user.currentTrack ? { ...user.currentTrack } : undefined,
  };
}

function isLikelyOpaqueUserId(value: string | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) return true;
  if (/^[0-9a-f]{32,64}$/i.test(normalized)) return true;
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(normalized)) return true;
  if (/^user_[0-9A-Za-z]+$/.test(normalized)) return true;
  return false;
}

function shortUserId(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length <= 10) return normalized;
  return normalized.slice(0, 8);
}

function resolveFriendlyDisplayName(value: string | undefined, userId?: string): string {
  const normalized = value?.trim();
  if (normalized && !isLikelyOpaqueUserId(normalized)) {
    return normalized;
  }
  const shortId = shortUserId(userId);
  if (shortId) {
    return `User ${shortId}`;
  }
  return 'Unknown';
}

function resolveFriendlyUsername(value: string | undefined, displayName: string, userId?: string): string {
  const normalized = value?.trim();
  if (normalized && !isLikelyOpaqueUserId(normalized)) {
    return normalized.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  }
  const shortId = shortUserId(userId);
  if (shortId) {
    return `user_${shortId.toLowerCase()}`;
  }
  return displayName.toLowerCase().replace(/\s+/g, '_').slice(0, 40) || 'user';
}

function hostToLiveUser(liveId: string, index: number, host: LiveItem['hosts'][number]): LiveUser {
  const resolvedId = host.id?.trim() || `host-${liveId}-${index}`;
  const resolvedName = resolveFriendlyDisplayName(host.name?.trim() || host.username?.trim(), resolvedId);
  const resolvedUsername = resolveFriendlyUsername(host.username?.trim(), resolvedName, resolvedId);
  return {
    id: resolvedId,
    name: resolvedName,
    username: resolvedUsername,
    age: host.age,
    verified: host.verified,
    country: host.country,
    bio: host.bio,
    avatarUrl: host.avatar,
  };
}

export function createRoomFromLive(
  live: LiveItem,
  options: CreateRoomFromLiveOptions = {},
): LiveRoom {
  const {
    inviteOnly = false,
    initialBoostRank = null,
    initialBoosts = 0,
    hostUserOverride,
  } = options;

  const mappedHosts = (live.hosts || []).map((host, index) => hostToLiveUser(live.id, index, host));
  const resolvedHost = hostUserOverride
    ? cloneUser(hostUserOverride)
    : mappedHosts[0]
      ? cloneUser(mappedHosts[0])
      : cloneUser(liveSessionUser);

  // Only add streamers if there are actual hosts defined
  // Don't make the current user a streamer just because they're viewing
  const streamers = mappedHosts.length > 0
    ? mappedHosts.map(cloneUser)
    : [];

  return {
    id: live.id,
    title: live.title,
    inviteOnly,
    hostUser: resolvedHost,
    streamers,
    watchers: [],
    pendingHostRequestUserIds: [],
    pendingCoHostInviteUserIds: [],
    pendingCoHostInviterByUserId: {},
    chatMessages: [],
    boostRank: initialBoostRank,
    totalBoosts: initialBoosts,
    bannedUserIds: [],
    bannedUsers: [],
    createdAt: Date.now(),
  };
}
