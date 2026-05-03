import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useAuth as useSessionAuth } from '../auth/clerkSession';
import { useFriendshipsRepo, useSocialRepo } from '../data/provider';
import type { SocialUser } from '../data/contracts';
import { useAppIsActive } from '../hooks/useAppIsActive';

export type FriendStatus = 'live' | 'online' | 'busy' | 'offline' | 'recent';

export interface Friend {
  id: string;
  name: string;
  username?: string;
  status: FriendStatus;
  imageUrl?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  isLive?: boolean;
  statusText?: string;
  lastSeen?: string;
}

interface FriendsContextType {
  friends: Friend[];
  loading: boolean;
  setFriends: (friends: Friend[]) => void;
  updateFriendStatus: (friendId: string, status: FriendStatus) => Promise<void>;
  setFriendLive: (friendId: string, isLive: boolean) => Promise<void>;
  refreshFriends: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);
const EMPTY_SOCIAL_USERS: SocialUser[] = [];
const EMPTY_ACCEPTED_FRIEND_IDS = new Set<string>();
const EMPTY_FRIENDS: Friend[] = [];

function areFriendsEqual(left: Friend[], right: Friend[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((friend, index) => {
    const other = right[index];
    return (
      other &&
      friend.id === other.id &&
      friend.name === other.name &&
      friend.username === other.username &&
      friend.status === other.status &&
      friend.imageUrl === other.imageUrl &&
      friend.avatarUrl === other.avatarUrl &&
      friend.isOnline === other.isOnline &&
      friend.isLive === other.isLive &&
      friend.statusText === other.statusText &&
      friend.lastSeen === other.lastSeen
    );
  });
}

function mapSocialUserToFriend(user: SocialUser): Friend {
  const status: FriendStatus =
    user.status ?? (user.isLive ? 'live' : user.isOnline ? 'online' : 'offline');
  const isOnline = status === 'live' || status === 'online' || status === 'busy';
  return {
    id: user.id,
    name: user.username,
    username: user.username,
    status,
    imageUrl: user.avatarUrl,
    avatarUrl: user.avatarUrl,
    isOnline,
    isLive: status === 'live',
    statusText: user.statusText,
    lastSeen: user.lastSeen,
  };
}

export function FriendsProvider({ children }: { children: ReactNode }) {
  const socialRepo = useSocialRepo();
  const friendshipsRepo = useFriendshipsRepo();
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const isAppActive = useAppIsActive();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isAppActive;
  const socialUsers = useMemo<SocialUser[]>(
    () => (queriesEnabled ? socialRepo.listUsers({ limit: 300 }) : EMPTY_SOCIAL_USERS),
    [queriesEnabled, socialRepo],
  );
  const acceptedFriendIds = useMemo<Set<string>>(
    () =>
      queriesEnabled
        ? new Set(friendshipsRepo.listAcceptedFriendIds())
        : EMPTY_ACCEPTED_FRIEND_IDS,
    [friendshipsRepo, queriesEnabled],
  );
  const [friends, setFriendsState] = useState<Friend[]>(EMPTY_FRIENDS);
  const [loading, setLoading] = useState(false);

  const setFriends = useCallback((newFriends: Friend[]) => {
    setFriendsState(newFriends);
  }, []);

  const syncFriendsFromRepo = useCallback(() => {
    if (!queriesEnabled || !userId) return;
    if (!isAppActive) return;
    const filteredUsers = socialUsers.filter(
      (u) => u.id !== userId && u.id !== 'me' && acceptedFriendIds.has(u.id),
    );
    const nextFriends = filteredUsers.map(mapSocialUserToFriend);
    setFriendsState((currentFriends) =>
      areFriendsEqual(currentFriends, nextFriends) ? currentFriends : nextFriends,
    );
  }, [acceptedFriendIds, isAppActive, queriesEnabled, socialUsers, userId]);

  const updateFriendStatus = useCallback(async (friendId: string, status: FriendStatus) => {
    setFriendsState((prev) =>
      prev.map((friend) =>
        friend.id === friendId
          ? {
              ...friend,
              status,
              isOnline: status === 'live' || status === 'online' || status === 'busy',
              isLive: status === 'live',
              lastSeen:
                status === 'recent' || status === 'offline'
                  ? new Date().toISOString()
                  : friend.lastSeen,
            }
          : friend
      )
    );
    await socialRepo.updateUserStatus({ userId: friendId, status });
  }, [socialRepo]);

  const setFriendLive = useCallback(async (friendId: string, isLive: boolean) => {
    setFriendsState((prev) =>
      prev.map((friend) =>
        friend.id === friendId
          ? (() => {
              const fallbackStatus: FriendStatus =
                friend.status === 'live' ? 'online' : friend.status;
              const nextStatus: FriendStatus = isLive ? 'live' : fallbackStatus;
              const nextIsOnline =
                nextStatus === 'live' || nextStatus === 'online' || nextStatus === 'busy';
              return {
                ...friend,
                status: nextStatus,
                isOnline: nextIsOnline,
                isLive,
                lastSeen: !isLive && !nextIsOnline ? new Date().toISOString() : friend.lastSeen,
              };
            })()
          : friend
      )
    );
    await socialRepo.setUserLive({ userId: friendId, isLive });
  }, [socialRepo]);

  const refreshFriends = useCallback(async () => {
    if (!isAppActive) return;
    setLoading(true);
    try {
      syncFriendsFromRepo();
    } finally {
      setLoading(false);
    }
  }, [isAppActive, syncFriendsFromRepo]);

  useEffect(() => {
    syncFriendsFromRepo();
  }, [syncFriendsFromRepo]);

  return (
    <FriendsContext.Provider
      value={{
        friends,
        loading,
        setFriends,
        updateFriendStatus,
        setFriendLive,
        refreshFriends,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) {
    if (__DEV__) {
      console.warn('useFriends must be used within a FriendsProvider. Using default values.');
    }
    // Return safe default values instead of throwing
    return {
      friends: [],
      loading: false,
      setFriends: () => {
        if (__DEV__) {
          console.warn('setFriends called outside FriendsProvider');
        }
      },
      updateFriendStatus: async () => {
        if (__DEV__) {
          console.warn('updateFriendStatus called outside FriendsProvider');
        }
      },
      setFriendLive: async () => {
        if (__DEV__) {
          console.warn('setFriendLive called outside FriendsProvider');
        }
      },
      refreshFriends: async () => {
        if (__DEV__) {
          console.warn('refreshFriends called outside FriendsProvider');
        }
      },
    };
  }
  return context;
}
