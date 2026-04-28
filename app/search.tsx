import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';

import { Ionicons } from '@expo/vector-icons';

import { AppScreen, AppText, Avatar } from '../src/components';
import { useFriends } from '../src/context';
import { useLive } from '../src/context/LiveContext';
import { useProfile } from '../src/context/ProfileContext';
import { useSearchRepo } from '../src/data/provider';
import { colors, radius, spacing } from '../src/theme';
import { hapticTap } from '../src/utils/haptics';
import type { LiveUser } from '../src/features/liveroom/types';
import type { ListSearchIndexResponse } from '../src/data/contracts';
import { useAppIsActive } from '../src/hooks/useAppIsActive';
import { subscribeBootstrap } from '../src/lib/spacetime';

type SearchTab = 'All' | 'Friends' | 'Live' | 'People' | 'Chat';
type SearchItemType = Exclude<SearchTab, 'All'>;

type SearchItem = {
  id: string;
  type: SearchItemType;
  title: string;
  subtitle: string;
  userId?: string;
  liveId?: string;
  imageUrl?: string;
  status?: 'online' | 'live' | 'busy' | 'offline' | 'recent';
};

const SEARCH_TABS: SearchTab[] = ['All', 'Friends', 'Live', 'People', 'Chat'];

function getParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getInitialTab(tabParam: string | undefined): SearchTab {
  if (!tabParam) return 'All';
  const normalized = tabParam.trim().toLowerCase();
  const match = SEARCH_TABS.find((tab) => tab.toLowerCase() === normalized);
  return match ?? 'All';
}

export default function SearchScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ tab?: string | string[]; mode?: string | string[] }>();
  const isAppActive = useAppIsActive();
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const searchRepo = useSearchRepo();
  const { friends } = useFriends();
  const { showProfile } = useProfile();
  const shouldReadSearchIndex = isAppActive && isFocused && isAuthLoaded && isSignedIn && !!userId;
  const searchIndex = useMemo<ListSearchIndexResponse>(
    () =>
      shouldReadSearchIndex
        ? searchRepo.listIndex()
        : {
          users: [],
          conversations: [],
          lives: [],
        },
    [searchRepo, shouldReadSearchIndex],
  );
  const { switchLiveRoom } = useLive();
  const [q, setQ] = useState('');
  const initialTab = useMemo(() => getInitialTab(getParamValue(params.tab)), [params.tab]);
  const [tab, setTab] = useState<SearchTab>(initialTab);
  const addFriendsMode = getParamValue(params.mode) === 'add_friends';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!shouldReadSearchIndex) {
      return;
    }

    return subscribeBootstrap();
  }, [shouldReadSearchIndex]);

  const data = useMemo<SearchItem[]>(() => {
    const peopleQuery = q.trim().toLowerCase();
    const friendItems: SearchItem[] = friends.map((friend) => ({
      id: `friend-${friend.id}`,
      type: 'Friends',
      title: friend.name,
      subtitle:
        friend.status === 'live'
          ? `@${friend.username ?? friend.id} · Live now`
          : friend.status === 'busy'
            ? `@${friend.username ?? friend.id} · Busy`
          : friend.status === 'online'
            ? `@${friend.username ?? friend.id} · Online`
            : `@${friend.username ?? friend.id} · ${friend.lastSeen ?? 'Recently active'}`,
      userId: friend.id,
      imageUrl: friend.avatarUrl || friend.imageUrl,
      status: friend.status,
    }));

    const peopleItems: SearchItem[] = searchIndex.users
      .filter((searchUser) => {
        if (searchUser.id === 'me' || searchUser.id === userId) return false;
        if (!peopleQuery) return true;
        return searchUser.username.toLowerCase().includes(peopleQuery);
      })
      .map((searchUser) => {
        // Preserve canonical status when available so Busy does not downgrade to Online.
        const status =
          searchUser.status ??
          (searchUser.isLive
            ? 'live'
            : searchUser.isOnline
              ? 'online'
              : searchUser.lastSeen
                ? 'recent'
                : 'offline');
        return {
          id: `people-${searchUser.id}`,
          type: 'People',
          title: searchUser.username,
          subtitle:
            status === 'live'
              ? 'Live now'
              : status === 'busy'
                ? 'Busy'
                : status === 'online'
                  ? 'Online'
                  : searchUser.lastSeen || 'Recently active',
          userId: searchUser.id,
          imageUrl: searchUser.avatarUrl,
          status,
        };
      });

    const chatItems: SearchItem[] = searchIndex.conversations.map((conversation) => {
      const otherUser = searchIndex.users.find((user) => user.id === conversation.otherUserId);
      const status =
        otherUser?.status ??
        (otherUser?.isLive
          ? 'live'
          : otherUser?.isOnline
            ? 'online'
            : otherUser?.lastSeen
              ? 'recent'
              : 'offline');
      return {
        id: `chat-${conversation.id}`,
        type: 'Chat',
        title: otherUser?.username ?? conversation.otherUserId,
        subtitle: conversation.lastMessage.text,
        userId: conversation.otherUserId,
        imageUrl: otherUser?.avatarUrl,
        status,
      };
    });

    const liveItems: SearchItem[] = searchIndex.lives.map((live) => ({
      id: `live-${live.id}`,
      type: 'Live',
      title: live.title,
      subtitle: `LIVE · ${live.viewers} watching`,
      liveId: live.id,
      imageUrl: live.hosts?.[0]?.avatar || live.images?.[0],
      status: 'live',
    }));

    return [...friendItems, ...peopleItems, ...chatItems, ...liveItems];
  }, [friends, q, searchIndex, userId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return data.filter((item) => {
      const tabMatch = tab === 'All' ? true : item.type === tab;
      let queryMatch = true;
      if (item.type === 'People') {
        queryMatch =
          query.length > 0
            ? item.title.toLowerCase().includes(query)
            : tab === 'People';
      } else if (query.length) {
        queryMatch = `${item.title} ${item.subtitle}`.toLowerCase().includes(query);
      }
      return tabMatch && queryMatch;
    });
  }, [data, q, tab]);

  const handleItemPress = (item: SearchItem) => {
    hapticTap();

    // In add-friends mode, always open the profile modal instead of navigating
    // away (e.g. into a live stream or chat).
    if (addFriendsMode && (item.userId || (item.type === 'Live' && item.liveId))) {
      const resolvedUserId =
        item.userId ??
        (item.type === 'Live' && item.liveId
          ? searchIndex.lives.find((l) => l.id === item.liveId)?.hosts?.[0]?.id
          : undefined);

      if (resolvedUserId) {
        const socialUser = searchIndex.users.find((user) => user.id === resolvedUserId);
        const friend = friends.find((friendItem) => friendItem.id === resolvedUserId);
        const profileUser: LiveUser = {
          id: resolvedUserId,
          name: friend?.name ?? socialUser?.username ?? item.title,
          username: friend?.username ?? socialUser?.username ?? item.title.toLowerCase().replace(/\s+/g, ''),
          age: 0,
          country: '',
          bio: socialUser?.statusText ?? friend?.statusText ?? '',
          avatarUrl: friend?.avatarUrl ?? friend?.imageUrl ?? socialUser?.avatarUrl ?? item.imageUrl ?? '',
          verified: false,
        };
        showProfile(profileUser);
        return;
      }
    }

    if (item.type === 'Live' && item.liveId) {
      const live = searchIndex.lives.find((candidate) => candidate.id === item.liveId);
      if (live) {
        const didJoinLive = switchLiveRoom(live);
        if (!didJoinLive) {
          return;
        }
        router.push({
          pathname: '/live',
          params: { id: live.id },
        });
      }
      return;
    }

    if (item.userId) {
      router.push(`/chat/${item.userId}`);
    }
  };

  return (
    <AppScreen noPadding>
      <View style={styles.container}>
        <View style={styles.searchRow}>
          <View style={[styles.inputWrap, styles.searchBarContainer]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.back()} style={styles.cancelButton}>
            <AppText variant="body" style={styles.cancelText}>
              Cancel
            </AppText>
          </Pressable>
        </View>

        {addFriendsMode ? (
          <AppText variant="small" secondary style={styles.modeHint}>
            Tap a user to open their profile and send a friend request.
          </AppText>
        ) : null}

        <View style={styles.tabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {SEARCH_TABS.map((itemTab) => {
              const active = tab === itemTab;
              return (
                <Pressable
                  key={itemTab}
                  onPress={() => setTab(itemTab)}
                  style={[styles.tabPill, active ? styles.tabPillActive : styles.tabPillInactive]}
                >
                  <AppText
                    variant="small"
                    style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}
                  >
                    {itemTab}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
                onPress={() => handleItemPress(item)}
              >
                <View style={styles.avatarContainer}>
                  <Avatar uri={item.imageUrl} name={item.title} size="sm" />
                  {item.status === 'online' && <View style={styles.onlineDot} />}
                  {item.status === 'busy' && <View style={styles.busyDot} />}
                  {item.status === 'live' && <View style={styles.liveDot} />}
                </View>
                <View style={styles.resultContent}>
                  <View style={styles.resultMeta}>
                    <AppText variant="tiny" style={styles.resultType}>
                      {item.type}
                    </AppText>
                  </View>
                  <AppText variant="body" style={styles.resultTitle}>
                    {item.title}
                  </AppText>
                  <AppText variant="small" secondary style={styles.resultSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </AppText>
                </View>
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyState}>
              <AppText style={styles.emptyTitle}>No results</AppText>
              <AppText variant="small" secondary style={styles.emptySubtitle}>
                Try a different keyword or tab.
              </AppText>
            </View>
          )}
        </ScrollView>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inputWrap: {
    flex: 1,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    height: 36,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 0,
    fontSize: 15,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  cancelText: {
    color: colors.textPrimary,
    opacity: 0.9,
  },
  tabsWrapper: {
    marginHorizontal: -spacing.lg,
    marginTop: spacing.md,
  },
  tabsContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  modeHint: {
    marginTop: spacing.sm,
  },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabPillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  tabPillInactive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderSubtle,
  },
  tabText: {
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.background,
  },
  tabTextInactive: {
    color: colors.textPrimary,
    opacity: 0.85,
  },
  results: {
    marginTop: spacing.lg,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  avatarContainer: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accentSuccess,
    borderWidth: 2,
    borderColor: colors.background,
  },
  busyDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accentDanger,
    borderWidth: 2,
    borderColor: colors.background,
  },
  liveDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accentDanger,
    borderWidth: 2,
    borderColor: colors.background,
  },
  resultRowPressed: {
    opacity: 0.75,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultType: {
    color: colors.accentPrimary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  resultTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  resultSubtitle: {
    marginTop: 0,
  },
  emptyState: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textMuted,
  },
});
