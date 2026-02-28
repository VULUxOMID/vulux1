import type { Friend as ContextFriend } from '../../context/FriendsContext';
import type { LivePresence } from '../../data/contracts';
import type { Friend as ActivityFriend } from './ActivitiesRow';
export type FriendLiveActivity = {
  userId: string;
  activity: 'hosting' | 'watching';
  liveId?: string;
  updatedAt: number;
};

export function buildActivityFriends(
  friends: ContextFriend[],
  activities: FriendLiveActivity[],
): ActivityFriend[] {
  const activitiesByUserId = new Map(
    activities.map((activity) => [activity.userId, activity]),
  );

  return friends.reduce<ActivityFriend[]>((acc, friend) => {
    const activity = activitiesByUserId.get(friend.id);
    if (!activity) return acc;
    if (!activity.liveId || activity.liveId.trim().length === 0) return acc;

    acc.push({
      id: friend.id,
      name: friend.name,
      imageUrl: friend.imageUrl ?? friend.avatarUrl,
      status: activity.activity === 'hosting' ? 'live' : 'online',
      liveId: activity.liveId,
    });

    return acc;
  }, []);
}

export function buildFriendActivitiesFromPresence({
  friendIds,
  liveIds,
  livePresence,
}: {
  friendIds: string[];
  liveIds: Set<string>;
  livePresence: LivePresence[];
}): FriendLiveActivity[] {
  const normalizedFriendIds = new Set(friendIds.map((friendId) => friendId.trim()).filter(Boolean));
  if (normalizedFriendIds.size === 0 || livePresence.length === 0) {
    return [];
  }

  const activitiesByUserId = new Map<string, FriendLiveActivity>();
  for (const presence of livePresence) {
    if (!normalizedFriendIds.has(presence.userId)) continue;
    if (!presence.liveId || !liveIds.has(presence.liveId)) continue;

    const previous = activitiesByUserId.get(presence.userId);
    if (previous && previous.updatedAt >= presence.updatedAt) continue;

    activitiesByUserId.set(presence.userId, {
      userId: presence.userId,
      activity: presence.activity,
      liveId: presence.liveId,
      updatedAt: presence.updatedAt,
    });
  }

  return Array.from(activitiesByUserId.values());
}
