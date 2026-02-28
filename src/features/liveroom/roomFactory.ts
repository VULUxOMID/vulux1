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

function hostToLiveUser(liveId: string, index: number, host: LiveItem['hosts'][number]): LiveUser {
  const resolvedName = host.name?.trim() || 'Host';
  const resolvedUsername =
    host.username?.trim() || resolvedName.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return {
    id: host.id?.trim() || `host-${liveId}-${index}`,
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
    chatMessages: [],
    boostRank: initialBoostRank,
    totalBoosts: initialBoosts,
    bannedUserIds: [],
    bannedUsers: [],
    createdAt: Date.now(),
  };
}
