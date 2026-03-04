import type { LiveState, LiveRoom } from '../liveroom/types';
import type { LiveItem } from './LiveSection';

type HostFallbackInput = {
  queriesEnabled: boolean;
  isHost: boolean;
  isLiveEnding: boolean;
  liveState: LiveState;
  activeLive: LiveItem | null;
  liveRoom: LiveRoom | null;
};

export function deriveHostActiveLiveFallback({
  queriesEnabled,
  isHost,
  isLiveEnding,
  liveState,
  activeLive,
  liveRoom,
}: HostFallbackInput): LiveItem | null {
  if (!queriesEnabled || !isHost || isLiveEnding || liveState === 'LIVE_CLOSED') {
    return null;
  }

  if (activeLive) {
    return activeLive;
  }

  if (!liveRoom) {
    return null;
  }

  const hostAvatar = liveRoom.hostUser.avatarUrl ?? '';
  return {
    id: liveRoom.id,
    title: liveRoom.title,
    viewers: Math.max(1, liveRoom.watchers.length + liveRoom.streamers.length),
    boosted: false,
    images: hostAvatar ? [hostAvatar] : [],
    hosts: [
      {
        id: liveRoom.hostUser.id,
        username: liveRoom.hostUser.username,
        name: liveRoom.hostUser.name,
        age: liveRoom.hostUser.age,
        country: liveRoom.hostUser.country,
        bio: liveRoom.hostUser.bio,
        verified: liveRoom.hostUser.verified,
        avatar: hostAvatar,
      },
    ],
  };
}

export function mergeHomeLiveNowList(
  repositoryLives: LiveItem[],
  hostActiveLive: LiveItem | null,
): LiveItem[] {
  if (!hostActiveLive) {
    return repositoryLives;
  }
  if (repositoryLives.some((live) => live.id === hostActiveLive.id)) {
    return repositoryLives;
  }
  return [hostActiveLive, ...repositoryLives];
}
