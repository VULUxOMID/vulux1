import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth as useSessionAuth } from '../../auth/spacetimeSession';

import { AppButton, AppScreen, AppText } from '../../components';
import { useFriends } from '../../context';
import { onHomeScrollTop } from '../../services/uiEvents';
import { colors, radius, spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';
import { toast } from '../../components/Toast';
import { ActivitiesRow, Friend } from './ActivitiesRow';
import { FloatingGoLiveButton } from './FloatingGoLiveButton';
import { FriendLivePreviewSheet } from './FriendLivePreviewSheet';
import { LiveItem, LiveSection } from './LiveSection';
import { GlobalChatSheet, ChatMessage } from './chat/GlobalChatSheet';
import { useRepositories } from '../../data/provider';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import { HomeStickyHeader } from './components/HomeStickyHeader';
import { GlobalChatWidget } from './widgets/GlobalChatWidget';
import { EventWidget } from './widgets/EventWidget';
import {
  buildActivityFriends,
  buildFriendActivitiesFromPresence,
  type FriendLiveActivity,
} from './activityFriends';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import { useUserProfile } from '../../context/UserProfileContext';
import {
  spacetimeDb,
  subscribeBootstrap,
  subscribeGlobalChat,
  subscribeSpacetimeDataChanges,
} from '../../lib/spacetime';
import { useLive } from '../../context/LiveContext';
import { deriveHostActiveLiveFallback, mergeHomeLiveNowList } from './liveNowList';
import {
  countDistinctActivePlayersNow,
  readActivePlayersNowFromEventOverview,
} from './widgets/eventRuntimeConfig';

type LeaderboardPreviewItem = {
  id: string;
  rank: number;
  displayName: string;
  cashAmount: number;
  isCurrentUser?: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    openChat?: string;
    messageId?: string;
    replyToMessageId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const { userProfile } = useUserProfile();
  const { activeLive, liveRoom, isHost, isLiveEnding, liveState, switchLiveRoom } = useLive();
  const [eventMetricsRefreshNonce, setEventMetricsRefreshNonce] = useState(0);
  const currentUserDisplayName = userProfile.name || userProfile.username || 'User';
  const {
    leaderboard: leaderboardRepo,
    messages: messagesRepo,
    live: liveRepo,
    notifications: notificationsRepo,
  } = useRepositories();
  const queriesEnabled =
    isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const isWideLayout = windowWidth >= 1080;

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
  const featuredLive = lives[0] ?? null;
  const repositoryGlobalMessages = useMemo(
    () => (queriesEnabled ? messagesRepo.listGlobalMessages({ limit: 180 }) : []),
    [messagesRepo, queriesEnabled],
  );
  const mentionUsers = useMemo(
    () => (queriesEnabled ? messagesRepo.listMentionUsers({ limit: 240 }) : []),
    [messagesRepo, queriesEnabled],
  );
  const leaderboardPreview = useMemo<LeaderboardPreviewItem[]>(() => {
    if (!queriesEnabled) return [];
    return leaderboardRepo
      .listLeaderboardItems({ limit: 12, includeCurrentUser: true })
      .filter(
        (item, index, items) =>
          item.id && items.findIndex((candidate) => candidate.id === item.id) === index,
      )
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        rank: item.rank,
        displayName: item.displayName,
        cashAmount: item.cashAmount,
        isCurrentUser: item.isCurrentUser,
      }));
  }, [leaderboardRepo, queriesEnabled]);
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

      const chatId = typeof metadata.chatId === 'string' ? metadata.chatId.trim().toLowerCase() : '';
      if (chatId.length > 0 && chatId !== 'global') {
        return count;
      }

      const roomId = typeof metadata.roomId === 'string' ? metadata.roomId.trim().toLowerCase() : '';
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
    const overviewActivePlayers = readActivePlayersNowFromEventOverview((spacetimeDb as any).db);
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
    return subscribeSpacetimeDataChanges((event) => {
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

  const screenStyles = useMemo(
    () =>
      StyleSheet.create({
        scroll: {
          flex: 1,
        },
        scrollContent: {
          paddingBottom: spacing.xl * 4,
          paddingHorizontal: spacing.lg,
          gap: spacing.xl,
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
          ? lives.find((item) => item.id === friend.liveId)
          : undefined;
        if (!live) return;

        const others = activityFriends.filter(
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
    [activityFriends, lives],
  );

  const handleOpenLive = useCallback(
    (item: LiveItem) => {
      hapticTap();
      const didJoinLive = switchLiveRoom(item);
      if (!didJoinLive) {
        return;
      }
      router.push({
        pathname: '/live',
        params: { id: item.id },
      });
    },
    [router, switchLiveRoom],
  );

  const handleOpenPrimaryLive = useCallback(() => {
    if (featuredLive) {
      handleOpenLive(featuredLive);
      return;
    }

    hapticTap();
    router.push('/go-live');
  }, [featuredLive, handleOpenLive, router]);

  const liveEntryDescription = featuredLive
    ? `${featuredLive.title} is moving right now.`
    : 'Start a room when discovery is quiet.';
  const friendsSectionSubtitle = activityFriends.length > 0
    ? `${activityFriends.length} friend${activityFriends.length === 1 ? '' : 's'} active across live rooms.`
    : 'No friend activity yet. Open friends and build your graph.';
  const liveSectionSubtitle = lives.length > 0
    ? `${lives.length} room${lives.length === 1 ? '' : 's'} available right now.`
    : 'No live rooms yet. Start the next session.';
  const eventSectionSubtitle = activePlayersNow > 0
    ? `${formatCompactCount(activePlayersNow)} players are active now.`
    : 'Waiting for event traffic to build.';

  return (
    <AppScreen noPadding>
      <HomeStickyHeader
        title="Hub"
        searchAnim={searchAnim}
        searchText={searchText}
        onChangeSearchText={setSearchText}
      />

      <Animated.ScrollView
        ref={scrollRef}
        style={screenStyles.scroll}
        contentContainerStyle={screenStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        <View style={styles.heroCard}>
          <View style={[styles.heroHeader, isWideLayout && styles.heroHeaderWide]}>
            <View style={styles.heroCopy}>
              <AppText variant="micro" style={styles.sectionEyebrow}>
                DISCOVERY HUB
              </AppText>
              <AppText variant="h2">Everything moving now, in one place</AppText>
              <AppText variant="small" secondary>
                Live rooms, event momentum, friend activity, and leaderboard shifts from the signed-in home route.
              </AppText>
            </View>
            <AppButton
              title={featuredLive ? 'Open top live' : 'Go live'}
              size="small"
              variant={featuredLive ? 'primary' : 'secondary'}
              onPress={handleOpenPrimaryLive}
            />
          </View>

          <View style={styles.heroMetricsRow}>
            <HubMetricPill label="Live" value={formatCompactCount(lives.length)} />
            <HubMetricPill label="Players" value={formatCompactCount(activePlayersNow)} />
            <HubMetricPill label="Friends" value={formatCompactCount(activityFriends.length)} />
            <HubMetricPill label="Chat" value={formatCompactCount(globalChatNotificationCount)} />
          </View>
        </View>

        <View style={styles.entryGrid}>
          <HubEntryCard
            icon="radio"
            label="Live now"
            value={formatCompactCount(lives.length)}
            description={liveEntryDescription}
            accentColor={colors.accentDanger}
            onPress={handleOpenPrimaryLive}
          />
          <HubEntryCard
            icon="flash"
            label="Event"
            value={formatCompactCount(activePlayersNow)}
            description={activePlayersNow > 0 ? 'Active players in the current event.' : 'Open Play and enter when activity rises.'}
            accentColor={colors.accentPrimary}
            onPress={() => {
              hapticTap();
              router.push('/(tabs)/play');
            }}
          />
          <HubEntryCard
            icon="people"
            label="Friends"
            value={formatCompactCount(activityFriends.length)}
            description={
              activityFriends.length > 0
                ? 'Friends are already active in live rooms.'
                : 'Open friends and connect before the next room starts.'
            }
            accentColor={colors.accentPrimarySoft}
            onPress={() => {
              hapticTap();
              router.push('/friends');
            }}
          />
          <HubEntryCard
            icon="trophy"
            label="Highlights"
            value={leaderboardPreview[0] ? `#${leaderboardPreview[0].rank}` : '--'}
            description={
              leaderboardPreview[0]
                ? `${leaderboardPreview[0].displayName} is leading the board.`
                : 'Open the leaderboard when ranked rows arrive.'
            }
            accentColor={colors.accentWarning}
            onPress={() => {
              hapticTap();
              router.push('/(tabs)/leaderboard');
            }}
          />
        </View>

        <View style={[styles.discoveryColumns, isWideLayout && styles.discoveryColumnsWide]}>
          <View style={styles.discoveryPrimaryColumn}>
            <HubSection
              eyebrow="FRIENDS ACTIVITY"
              title="See who is active before you jump in"
              subtitle={friendsSectionSubtitle}
              actionLabel="Open friends"
              onAction={() => {
                hapticTap();
                router.push('/friends');
              }}
            >
              {friendsLoading ? (
                <ActivitiesRow
                  friends={activityFriends}
                  onFriendPress={handleFriendPress}
                  loading
                />
              ) : activityFriends.length > 0 ? (
                <ActivitiesRow
                  friends={activityFriends}
                  onFriendPress={handleFriendPress}
                />
              ) : (
                <HubEmptyState
                  icon="people-outline"
                  title="No friend activity yet"
                  message="When friends host or join rooms, they show up here with a direct preview path."
                  actionLabel="Find friends"
                  onAction={() => {
                    hapticTap();
                    router.push('/friends');
                  }}
                />
              )}
            </HubSection>

            <HubSection
              eyebrow="LIVE NOW"
              title="Jump straight into a room"
              subtitle={liveSectionSubtitle}
              actionLabel={lives.length > 0 ? 'Open top live' : 'Go live'}
              onAction={handleOpenPrimaryLive}
            >
              {lives.length > 0 ? (
                <LiveSection lives={lives} showHeader={false} />
              ) : (
                <HubEmptyState
                  icon="videocam-outline"
                  title="No live rooms yet"
                  message="Discovery stays clean when there is nothing live. Start a room to seed the feed."
                  actionLabel="Go live"
                  onAction={() => {
                    hapticTap();
                    router.push('/go-live');
                  }}
                  primary
                />
              )}
            </HubSection>
          </View>

          <View style={styles.discoverySecondaryColumn}>
            <HubSection
              eyebrow="EVENT"
              title="Track event momentum"
              subtitle={eventSectionSubtitle}
              actionLabel="Open play"
              onAction={() => {
                hapticTap();
                router.push('/(tabs)/play');
              }}
            >
              <EventWidget
                onAnnounceWinner={handleWinnerAnnouncement}
                friends={friends}
                activePlayersNow={activePlayersNow}
              />
            </HubSection>

            <HubSection
              eyebrow="HIGHLIGHTS"
              title="Leaderboard and global room"
              subtitle="Catch ranking movement and jump into the shared conversation."
              actionLabel="Leaderboard"
              onAction={() => {
                hapticTap();
                router.push('/(tabs)/leaderboard');
              }}
            >
              <HubLeaderboardPreview
                items={leaderboardPreview}
                onOpenLeaderboard={() => {
                  hapticTap();
                  router.push('/(tabs)/leaderboard');
                }}
              />
              <GlobalChatWidget
                onOpen={() => setShowChat(true)}
                messageCount={globalChatNotificationCount}
                isChatOpen={showChat}
              />
            </HubSection>
          </View>
        </View>
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

function HubSection({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <AppText variant="micro" style={styles.sectionEyebrow}>
            {eyebrow}
          </AppText>
          <AppText variant="h3">{title}</AppText>
          <AppText variant="small" secondary>
            {subtitle}
          </AppText>
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressedAction]}>
            <AppText variant="smallBold" style={styles.sectionActionText}>
              {actionLabel}
            </AppText>
            <Ionicons name="arrow-forward" size={14} color={colors.accentPrimary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function HubEntryCard({
  icon,
  label,
  value,
  description,
  accentColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  description: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.entryCard, pressed && styles.entryCardPressed]}>
      <View style={[styles.entryIconWrap, { borderColor: accentColor }]}> 
        <Ionicons name={icon} size={18} color={accentColor} />
      </View>
      <View style={styles.entryCopy}>
        <AppText variant="smallBold">{label}</AppText>
        <AppText variant="h3">{value}</AppText>
        <AppText variant="small" secondary numberOfLines={2}>
          {description}
        </AppText>
      </View>
    </Pressable>
  );
}

function HubMetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <AppText variant="micro" style={styles.metricLabel}>
        {label}
      </AppText>
      <AppText variant="smallBold">{value}</AppText>
    </View>
  );
}

function HubEmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  primary?: boolean;
}) {
  return (
    <View style={styles.emptyStateCard}>
      <View style={styles.emptyStateIconWrap}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.emptyStateCopy}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="small" secondary>
          {message}
        </AppText>
      </View>
      {actionLabel && onAction ? (
        <AppButton
          title={actionLabel}
          size="small"
          variant={primary ? 'primary' : 'secondary'}
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}

function HubLeaderboardPreview({
  items,
  onOpenLeaderboard,
}: {
  items: LeaderboardPreviewItem[];
  onOpenLeaderboard: () => void;
}) {
  if (items.length === 0) {
    return (
      <HubEmptyState
        icon="trophy-outline"
        title="No leaderboard rows yet"
        message="Ranked players appear here as soon as the signed-in snapshot has live board data."
        actionLabel="Open leaderboard"
        onAction={onOpenLeaderboard}
      />
    );
  }

  return (
    <View style={styles.leaderboardCard}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={onOpenLeaderboard}
          style={({ pressed }) => [styles.leaderboardRow, pressed && styles.entryCardPressed]}
        >
          <View style={styles.leaderboardRankBadge}>
            <AppText variant="tinyBold" style={styles.leaderboardRankText}>
              #{item.rank}
            </AppText>
          </View>
          <View style={styles.leaderboardCopy}>
            <AppText variant="bodyBold" numberOfLines={1}>
              {item.displayName || 'Unknown player'}
            </AppText>
            <AppText variant="small" secondary numberOfLines={1}>
              {item.isCurrentUser ? 'Your position is live.' : 'Open the board for the full ladder.'}
            </AppText>
          </View>
          <AppText variant="smallBold" style={styles.leaderboardCash}>
            {formatCompactCount(item.cashAmount)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }

  return `${Math.floor(value)}`;
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroHeader: {
    gap: spacing.md,
  },
  heroHeaderWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.smMinus,
    paddingHorizontal: spacing.md,
    minWidth: 92,
    gap: spacing.xxs,
  },
  metricLabel: {
    color: colors.textMuted,
  },
  entryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  entryCard: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 150,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  entryCardPressed: {
    opacity: 0.88,
  },
  entryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  entryCopy: {
    gap: spacing.xs,
  },
  discoveryColumns: {
    gap: spacing.xl,
  },
  discoveryColumnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  discoveryPrimaryColumn: {
    flex: 1.2,
    gap: spacing.xl,
  },
  discoverySecondaryColumn: {
    flex: 0.9,
    gap: spacing.xl,
  },
  sectionPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionEyebrow: {
    color: colors.accentPrimary,
    letterSpacing: 1.2,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pressedAction: {
    opacity: 0.7,
  },
  sectionActionText: {
    color: colors.accentPrimary,
  },
  sectionBody: {
    gap: spacing.md,
  },
  emptyStateCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyStateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  emptyStateCopy: {
    gap: spacing.xs,
  },
  leaderboardCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  leaderboardRankBadge: {
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.overlayRankGoldSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardRankText: {
    color: colors.accentWarning,
  },
  leaderboardCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  leaderboardCash: {
    color: colors.accentCash,
  },
});
