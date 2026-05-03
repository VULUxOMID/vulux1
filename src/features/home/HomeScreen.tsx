import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, ScrollView, StyleSheet, UIManager } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth as useSessionAuth } from '../../auth/clerkSession';

import { AppScreen } from '../../components';
import { useFriends } from '../../context';
import { onHomeScrollTop } from '../../services/uiEvents';
import { spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';
import { toast } from '../../components/Toast';
import { ActivitiesRow, Friend } from './ActivitiesRow';
import { FloatingGoLiveButton } from './FloatingGoLiveButton';
import { FriendLivePreviewSheet } from './FriendLivePreviewSheet';
import { LiveItem } from './LiveSection';
import { GlobalChatSheet, ChatMessage } from './chat/GlobalChatSheet';
import { useRepositories } from '../../data/provider';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import { HomeStickyHeader } from './components/HomeStickyHeader';
import { HomeWidgetStack } from './components/HomeWidgetStack';
import { LiveSection } from './LiveSection';
import {
  buildActivityFriends,
  buildFriendActivitiesFromPresence,
  type FriendLiveActivity,
} from './activityFriends';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import { useUserProfile } from '../../context/UserProfileContext';
import {
  railwayDb,
  subscribeBootstrap,
  subscribeGlobalChat,
  subscribeRailwayDataChanges,
} from '../../lib/railwayRuntime';
import { useLive } from '../../context/LiveContext';
import { deriveHostActiveLiveFallback, mergeHomeLiveNowList } from './liveNowList';
import {
  countDistinctActivePlayersNow,
  readActivePlayersNowFromEventOverview,
} from './widgets/eventRuntimeConfig';

const PREVIEW_LIVES: LiveItem[] = [
  {
    id: 'preview-live-1',
    title: 'Late Night Vibes & Editing',
    viewers: 12400,
    boosted: true,
    images: ['https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80'],
    hosts: [
      {
        id: 'preview-host-1',
        username: 'alex_creates',
        name: 'Alex Creates',
        age: 25,
        country: 'NO',
        bio: '',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
      },
    ],
  },
  {
    id: 'preview-live-2',
    title: 'Ranked Grind',
    viewers: 842,
    images: ['https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80'],
    hosts: [
      {
        id: 'preview-host-2',
        username: 'mia_live',
        name: 'Mia',
        age: 24,
        country: 'SE',
        bio: '',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80',
      },
    ],
  },
  {
    id: 'preview-live-3',
    title: 'House Set',
    viewers: 2100,
    images: ['https://images.unsplash.com/photo-1571266028243-d220c9d4cf3a?auto=format&fit=crop&w=1200&q=80'],
    hosts: [
      {
        id: 'preview-host-3',
        username: 'zoe_mix',
        name: 'Zoe',
        age: 26,
        country: 'DK',
        bio: '',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=80',
      },
    ],
  },
];

const PREVIEW_FRIENDS: Friend[] = [
  { id: 'preview-friend-1', name: 'Mia', status: 'live', liveId: 'preview-live-2', imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80' },
  { id: 'preview-friend-2', name: 'Leo', status: 'recent', imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80' },
  { id: 'preview-friend-3', name: 'Zoe', status: 'live', liveId: 'preview-live-3', imageUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80' },
  { id: 'preview-friend-4', name: 'Kai', status: 'recent', imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80' },
  { id: 'preview-friend-5', name: 'Ava', status: 'recent', imageUrl: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=400&q=80' },
];

export default function HomeScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const params = useLocalSearchParams<{
    openChat?: string;
    messageId?: string;
    replyToMessageId?: string;
    preview?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const isPreview =
    __DEV__ &&
    (params.preview === '1' ||
      params.preview === 'true' ||
      (Array.isArray(params.preview) && params.preview.includes('1')));
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const { userProfile } = useUserProfile();
  const { activeLive, liveRoom, isHost, isLiveEnding, liveState } = useLive();
  const [eventMetricsRefreshNonce, setEventMetricsRefreshNonce] = useState(0);
  const currentUserDisplayName = userProfile.name || userProfile.username || 'User';
  const { messages: messagesRepo, live: liveRepo, notifications: notificationsRepo } =
    useRepositories();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const repositoryLives = useMemo<LiveItem[]>(
    () => (queriesEnabled ? liveRepo.listLives({ limit: 100 }) : []),
    [liveRepo, queriesEnabled],
  );
  const hostActiveLive = useMemo<LiveItem | null>(() => {
    return deriveHostActiveLiveFallback({
      queriesEnabled,
      isHost,
      isLiveEnding,
      liveState,
      activeLive,
      liveRoom,
    });
  }, [activeLive, isHost, isLiveEnding, liveRoom, liveState, queriesEnabled]);
  const lives = useMemo<LiveItem[]>(
    () => mergeHomeLiveNowList(repositoryLives, hostActiveLive),
    [hostActiveLive, repositoryLives],
  );
  const repositoryGlobalMessages = useMemo(
    () => (queriesEnabled ? messagesRepo.listGlobalMessages({ limit: 180 }) : []),
    [messagesRepo, queriesEnabled],
  );
  const mentionUsers = useMemo(
    () => (queriesEnabled ? messagesRepo.listMentionUsers({ limit: 240 }) : []),
    [messagesRepo, queriesEnabled],
  );
  const globalChatNotificationCount = useMemo(() => {
    if (!queriesEnabled) return 0;

    const unreadActivity = notificationsRepo.listNotifications({
      unreadOnly: true,
      types: ['activity'],
      limit: 240,
      userId: userId ?? undefined,
    });

    return unreadActivity.reduce((count, notification) => {
      if (notification.type !== 'activity') return count;
      if (notification.activityType !== 'mention' && notification.activityType !== 'reply') {
        return count;
      }

      const metadata = notification.metadata ?? {};
      const conversationKey =
        typeof metadata.conversationKey === 'string' ? metadata.conversationKey.trim() : '';
      if (conversationKey.length > 0) {
        return count;
      }

      const chatId =
        typeof metadata.chatId === 'string' ? metadata.chatId.trim().toLowerCase() : '';
      if (chatId.length > 0 && chatId !== 'global') {
        return count;
      }

      const roomId =
        typeof metadata.roomId === 'string' ? metadata.roomId.trim().toLowerCase() : '';
      if (roomId.length > 0 && roomId !== 'global') {
        return count;
      }

      return count + 1;
    }, 0);
  }, [notificationsRepo, queriesEnabled, userId]);
  const liveIds = useMemo(() => new Set(lives.map((live) => live.id)), [lives]);
  const friendIds = useMemo(() => friends.map((friend) => friend.id), [friends]);
  const livePresence = useMemo(
    () =>
      queriesEnabled
        ? liveRepo.listPresence({
            limit: 500,
            userIds: friendIds,
          })
        : [],
    [friendIds, liveRepo, queriesEnabled],
  );
  const activePlayersNow = useMemo(() => {
    if (!queriesEnabled) return 0;
    const overviewActivePlayers = readActivePlayersNowFromEventOverview((railwayDb as any).db);
    if (overviewActivePlayers !== null) {
      return overviewActivePlayers;
    }
    const allPresence = liveRepo.listPresence({
      limit: 2_000,
      activities: ['hosting', 'watching'],
    });
    return countDistinctActivePlayersNow(allPresence);
  }, [eventMetricsRefreshNonce, liveRepo, queriesEnabled]);
  const friendActivities = useMemo<FriendLiveActivity[]>(
    () => {
      if (!queriesEnabled) return [];
      return buildFriendActivitiesFromPresence({
        friendIds,
        liveIds,
        livePresence,
      });
    },
    [friendIds, liveIds, livePresence, queriesEnabled],
  );
  const validFriendActivities = useMemo(
    () =>
      friendActivities.filter(
        (activity) => !!activity.liveId && liveIds.has(activity.liveId),
      ),
    [friendActivities, liveIds],
  );
  const activityFriends = useMemo(
    () => buildActivityFriends(friends, validFriendActivities),
    [friends, validFriendActivities],
  );
  const displayLives = useMemo(
    () => (isPreview && lives.length === 0 ? PREVIEW_LIVES : lives),
    [isPreview, lives],
  );
  const displayActivityFriends = useMemo(
    () => (isPreview && activityFriends.length === 0 ? PREVIEW_FRIENDS : activityFriends),
    [activityFriends, isPreview],
  );
  const scrollRef = useRef<ScrollView>(null);
  const lastScrollY = useRef(0);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const [searchText, setSearchText] = useState('');
  const searchVisibleRef = useRef(false);
  const canToggleSearchRef = useRef(true);
  const [showChat, setShowChat] = useState(false);
  const [globalMessages, setGlobalMessages] = useState<ChatMessage[]>([]);
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const lastRemoteGlobalMessagesRef = useRef<ChatMessage[]>([]);

  const [friendSheetVisible, setFriendSheetVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [previewLive, setPreviewLive] = useState<LiveItem | null>(null);
  const [otherFriendsInLive, setOtherFriendsInLive] = useState<Friend[]>([]);

  useEffect(() => {
    const liveMessages = repositoryGlobalMessages as ChatMessage[];
    setGlobalMessages((previousMessages) => {
      if (!queriesEnabled) {
        return previousMessages;
      }

      let mergedRemoteMessages = liveMessages;
      if (liveMessages.length > 0) {
        lastRemoteGlobalMessagesRef.current = liveMessages;
      } else if (lastRemoteGlobalMessagesRef.current.length > 0) {
        mergedRemoteMessages = lastRemoteGlobalMessagesRef.current;
      }

      if (mergedRemoteMessages.length === 0 && previousMessages.length === 0) {
        return previousMessages;
      }

      const hasPersistedRemoteMessages = previousMessages.some(
        (message) =>
          message.type !== 'system' &&
          message.status !== 'sending' &&
          message.status !== 'sent' &&
          message.status !== 'failed',
      );
      if (mergedRemoteMessages.length === 0 && hasPersistedRemoteMessages) {
        return previousMessages;
      }

      const liveMessageIds = new Set(mergedRemoteMessages.map((message) => message.id));
      const localOnlyMessages = previousMessages.filter((message) => {
        if (liveMessageIds.has(message.id)) return false;
        return (
          message.type === 'system' ||
          message.status === 'sending' ||
          message.status === 'sent' ||
          message.status === 'failed'
        );
      });

      const mergedMessages = [...mergedRemoteMessages, ...localOnlyMessages];
      mergedMessages.sort((a, b) => a.createdAt - b.createdAt);
      return mergedMessages;
    });
  }, [queriesEnabled, repositoryGlobalMessages]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !userId) {
      lastRemoteGlobalMessagesRef.current = [];
      setGlobalMessages([]);
    }
  }, [isAuthLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (!queriesEnabled) return;
    requestBackendRefresh();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) return;
    return subscribeRailwayDataChanges((event) => {
      if (!event.scopes.includes('events') && !event.scopes.includes('live')) {
        return;
      }
      setEventMetricsRefreshNonce((current) => current + 1);
    });
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    const unsubscribe = showChat
      ? subscribeGlobalChat('global', {
          limit: 220,
          windowMs: 24 * 60 * 60 * 1000,
        })
      : subscribeBootstrap();
    return () => {
      unsubscribe();
    };
  }, [queriesEnabled, showChat]);

  useEffect(() => {
    if (params.openChat === 'true') {
      setShowChat(true);
      if (params.messageId) {
        setTargetMessageId(params.messageId);
      }
      if (params.replyToMessageId) {
        setReplyToMessageId(params.replyToMessageId);
      }
    }
  }, [params.openChat, params.messageId, params.replyToMessageId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: {
          flex: 1,
        },
        scrollContent: {
          paddingBottom: spacing.xl * 5,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        },
      }),
    [],
  );

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const handleWinnerAnnouncement = useCallback((text: string) => {
    setGlobalMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        user: 'system',
        text,
        type: 'system',
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const handleGlobalMessageSend = useCallback(
    (message: ChatMessage) => {
      setGlobalMessages((prev) => [...prev, message]);
      void messagesRepo
        .sendGlobalMessage({
          clientMessageId: message.id,
          message: {
            id: message.id,
            user: message.user,
            senderId: message.senderId,
            text: message.text,
            createdAt: message.createdAt,
            replyTo: message.replyTo
              ? {
                  id: message.replyTo.id,
                  user: message.replyTo.user,
                  text: message.replyTo.text,
                  senderId: message.replyTo.senderId,
                }
              : null,
          },
        })
        .then(() => {
          setGlobalMessages((prev) =>
            prev.map((currentMessage) =>
              currentMessage.id === message.id ? { ...currentMessage, status: 'sent' } : currentMessage,
            ),
          );
        })
        .catch((error) => {
          setGlobalMessages((prev) =>
            prev.map((currentMessage) =>
              currentMessage.id === message.id
                ? { ...currentMessage, status: 'failed' }
                : currentMessage,
            ),
          );
          toast.error('Global chat message failed to send. Please try again.');
          if (__DEV__) {
            console.warn('[home] Failed to send global message', error);
          }
        })
        .finally(() => {
          requestBackendRefresh();
        });
    },
    [messagesRepo],
  );

  const handleGlobalMessageEdit = useCallback(
    async (messageId: string, text: string) => {
      await messagesRepo.editGlobalMessage({
        messageId,
        text,
      });
    },
    [messagesRepo],
  );

  const handleGlobalMessageDelete = useCallback(
    async (messageId: string) => {
      await messagesRepo.deleteGlobalMessage({
        messageId,
      });
    },
    [messagesRepo],
  );

  const openSearch = useCallback(() => {
    if (searchVisibleRef.current) return;
    hapticTap();
    searchVisibleRef.current = true;
    searchAnim.stopAnimation();
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [searchAnim]);

  const closeSearch = useCallback(() => {
    if (!searchVisibleRef.current) return;
    hapticTap();
    searchVisibleRef.current = false;
    searchAnim.stopAnimation();
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [searchAnim]);

  const handleScroll = useCallback(
    (e: any) => {
      const y = e?.nativeEvent?.contentOffset?.y ?? 0;
      const dy = y - lastScrollY.current;
      lastScrollY.current = y;

      if (Math.abs(dy) > 5) {
        Keyboard.dismiss();
      }

      if (y < -60) {
        if (canToggleSearchRef.current) {
          canToggleSearchRef.current = false;

          if (searchVisibleRef.current) {
            closeSearch();
          } else {
            openSearch();
          }
        }
      } else if (y > -20) {
        canToggleSearchRef.current = true;
      }
    },
    [closeSearch, openSearch],
  );

  useEffect(() => {
    const unsub = onHomeScrollTop(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      openSearch();
    });
    return () => {
      unsub();
    };
  }, [openSearch]);

  const handleFriendPress = useCallback(
    (friend: Friend) => {
      hapticTap();

      if (friend.status === 'live' || friend.status === 'online') {
        const live = friend.liveId
          ? displayLives.find((item) => item.id === friend.liveId)
          : undefined;
        if (!live) return;

        const others = displayActivityFriends.filter(
          (f: Friend) =>
            (f.status === 'live' || f.status === 'online') &&
            f.id !== friend.id &&
            f.liveId === live.id,
        );

        setSelectedFriend(friend);
        setPreviewLive(live ?? null);
        setOtherFriendsInLive(others);
        setFriendSheetVisible(true);
      }
    },
    [displayActivityFriends, displayLives],
  );

  return (
    <AppScreen noPadding>
      <HomeStickyHeader
        searchAnim={searchAnim}
        searchText={searchText}
        onChangeSearchText={setSearchText}
      />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        <ActivitiesRow
          friends={displayActivityFriends}
          onFriendPress={handleFriendPress}
          loading={friendsLoading}
        />
        <HomeWidgetStack
          onOpenChat={() => setShowChat(true)}
          onAnnounceWinner={handleWinnerAnnouncement}
          friends={friends}
          activePlayersNow={activePlayersNow}
          messageCount={globalChatNotificationCount}
          isChatOpen={showChat}
        />
        <LiveSection lives={displayLives} />
      </Animated.ScrollView>

      <FloatingGoLiveButton
        visible
        bottomInset={insets.bottom}
        onPress={() => {
          hapticTap();
          router.push('/go-live');
        }}
      />

      <GlobalChatSheet
        visible={showChat}
        onClose={() => {
          setShowChat(false);
          setTargetMessageId(null);
          setReplyToMessageId(null);
          router.setParams({
            openChat: undefined,
            messageId: undefined,
            replyToMessageId: undefined,
          });
        }}
        messages={globalMessages}
        setMessages={setGlobalMessages}
        onSendMessage={handleGlobalMessageSend}
        onEditMessage={handleGlobalMessageEdit}
        onDeleteMessage={handleGlobalMessageDelete}
        mentionUsers={mentionUsers}
        focusMessageId={targetMessageId}
        autoReplyToMessageId={replyToMessageId}
        onFocusMessageHandled={() => {
          setTargetMessageId(null);
          setReplyToMessageId(null);
          router.setParams({
            openChat: undefined,
            messageId: undefined,
            replyToMessageId: undefined,
          });
        }}
        currentUserDisplayName={currentUserDisplayName}
        currentUserId={userId}
      />

      <FriendLivePreviewSheet
        visible={friendSheetVisible}
        onClose={() => setFriendSheetVisible(false)}
        friend={selectedFriend}
        live={previewLive}
        otherFriendsInLive={otherFriendsInLive}
      />
    </AppScreen>
  );
}
