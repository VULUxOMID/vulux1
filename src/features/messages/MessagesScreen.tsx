import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, UIManager } from 'react-native';
import { useAuth } from '../../auth/spacetimeSession';
import { useIsFocused } from '@react-navigation/native';

import { AppScreen } from '../../components';
import { useFriends } from '../../context';
import { useProfile } from '../../context/ProfileContext';
import { useRepositories } from '../../data/provider';
import type { Conversation, SocialUser } from '../../data/contracts';
import { hapticConfirm, hapticTap, hapticWarn } from '../../utils/haptics';
import { FriendLivePreviewSheet } from '../home/FriendLivePreviewSheet';
import { type LiveItem } from '../home/LiveSection';
import { type Friend } from '../home/ActivitiesRow';
import {
  buildActivityFriends,
  buildFriendActivitiesFromPresence,
  type FriendLiveActivity,
} from '../home/activityFriends';
import { MessagesFab } from './components/MessagesFab';
import { MessagesHeader } from './MessagesHeader';
import { MessagesList } from './MessagesList';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import type { LiveUser } from '../liveroom/types';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import { isSpacetimeViewActive, subscribeFriends } from '../../lib/spacetime';
import { ReportComposerModal } from '../reports/ReportComposerModal';
import { submitReport } from '../reports/reportingClient';
import { toast } from '../../components/Toast';

export default function MessagesScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { friends, loading: friendsLoading, refreshFriends } = useFriends();
  const { showProfile } = useProfile();
  const { live: liveRepo, social: socialRepo, messages: messagesRepo } = useRepositories();
  const [conversationLimit, setConversationLimit] = useState(50);
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const socialUsers = useMemo<SocialUser[]>(
    () => (queriesEnabled ? socialRepo.listUsers({ limit: 300 }) : []),
    [queriesEnabled, socialRepo],
  );
  const socialUsersById = useMemo<Record<string, SocialUser>>(() => {
    return socialUsers.reduce<Record<string, SocialUser>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [socialUsers]);
  const lives = useMemo<LiveItem[]>(
    () => (queriesEnabled ? liveRepo.listLives({ limit: 120 }) : []),
    [liveRepo, queriesEnabled],
  );
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
  const conversationsQueryArgs = useMemo(
    () => (queriesEnabled ? { limit: conversationLimit } : undefined),
    [conversationLimit, queriesEnabled],
  );
  const conversations = useMemo(
    () => (queriesEnabled ? messagesRepo.listConversations(conversationsQueryArgs) : []),
    [conversationsQueryArgs, messagesRepo, queriesEnabled],
  );
  const conversationsLoading = queriesEnabled && !isSpacetimeViewActive('my_conversations');

  useEffect(() => {
    setConversationLimit(50);
  }, [userId]);

  const [friendSheetVisible, setFriendSheetVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [previewLive, setPreviewLive] = useState<LiveItem | null>(null);
  const [otherFriendsInLive, setOtherFriendsInLive] = useState<Friend[]>([]);
  const [reportConversation, setReportConversation] = useState<Conversation | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!queriesEnabled) return;
    requestBackendRefresh();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeFriends();
  }, [queriesEnabled]);

  const handleFriendPress = useCallback(
    (friend: Friend) => {
      hapticTap();

      if (friend.status === 'live' || friend.status === 'online') {
        const live = friend.liveId
          ? lives.find((item) => item.id === friend.liveId)
          : undefined;
        if (!live) return;

        const others = activityFriends.filter(
          (item: Friend) =>
            (item.status === 'live' || item.status === 'online') &&
            item.id !== friend.id &&
            item.liveId === live.id,
        );

        setSelectedFriend(friend);
        setPreviewLive(live ?? null);
        setOtherFriendsInLive(others);
        setFriendSheetVisible(true);
      }
    },
    [activityFriends, lives],
  );

  const handleFindFriends = useCallback(() => {
    hapticTap();
    router.push({
      pathname: '/search',
      params: {
        mode: 'add_friends',
        tab: 'People',
      },
    });
  }, [router]);

  const listData = useMemo(() => {
    const pinnedConversations = conversations.filter((conversation) => conversation.pinned);
    const unpinnedConversations = conversations.filter(
      (conversation) => !conversation.pinned,
    );

    return [...pinnedConversations, ...unpinnedConversations];
  }, [conversations]);

  const handleScroll = useCallback((_event: any) => {
    // Reserved for future scroll-based interactions.
  }, []);

  const handleLoadMoreConversations = useCallback(() => {
    if (conversationsLoading) return;
    if (conversations.length < conversationLimit) return;
    setConversationLimit((previous) => previous + 50);
  }, [conversationLimit, conversations.length, conversationsLoading]);

  const handleConversationPress = useCallback(
    (conversation: Conversation) => {
      if (conversation.unreadCount > 0) {
        void messagesRepo.markConversationRead({ userId: conversation.otherUserId });
        requestBackendRefresh({
          scopes: ['messages', 'conversations', 'counts'],
          source: 'manual',
          reason: 'conversation_opened',
        });
      }
      router.push(`/chat/${conversation.otherUserId}`);
    },
    [messagesRepo, router],
  );

  const handleMarkConversationRead = useCallback(
    (conversation: Conversation) => {
      if (conversation.unreadCount <= 0) return;
      void messagesRepo.markConversationRead({ userId: conversation.otherUserId });
      requestBackendRefresh({
        scopes: ['messages', 'conversations', 'counts'],
        source: 'manual',
        reason: 'conversation_mark_read',
      });
    },
    [messagesRepo],
  );

  const handleViewProfile = useCallback(
    (targetUserId: string) => {
      const normalizedTargetUserId = targetUserId.trim();
      if (!normalizedTargetUserId) return;

      const profileUser =
        socialUsersById[normalizedTargetUserId] ??
        socialUsers.find(
          (user) => user.username.toLowerCase() === normalizedTargetUserId.toLowerCase(),
        );
      const resolvedProfileId = profileUser?.id ?? normalizedTargetUserId;
      const profilePayload: LiveUser = {
        id: resolvedProfileId,
        name: profileUser?.username ?? normalizedTargetUserId,
        username: profileUser?.username ?? normalizedTargetUserId,
        age: 0,
        country: '',
        bio: profileUser?.statusText ?? '',
        avatarUrl: profileUser?.avatarUrl ?? '',
        verified: false,
      };
      showProfile(profilePayload);
    },
    [showProfile, socialUsers, socialUsersById],
  );

  const handleReportUser = useCallback((conversation: Conversation) => {
    hapticWarn();
    setReportConversation(conversation);
  }, []);

  return (
    <AppScreen noPadding>
      <MessagesHeader
        title="Chat"
        onPressSearch={handleFindFriends}
        friends={activityFriends}
        onFriendPress={handleFriendPress}
        loading={friendsLoading}
      />

      <MessagesList
        conversations={listData}
        socialUsersById={socialUsersById}
        loading={conversationsLoading}
        emptyTitle={queriesEnabled ? 'No DMs yet' : 'Sign in to view DMs'}
        emptySubtitle={
          queriesEnabled
            ? 'Open a profile or a friend to start your first conversation.'
            : 'Authentication is required to load your messages.'
        }
        onPressConversation={handleConversationPress}
        onMarkAsRead={handleMarkConversationRead}
        onViewProfile={handleViewProfile}
        onReportUser={handleReportUser}
        onScroll={handleScroll}
        onEndReached={handleLoadMoreConversations}
      />

      <MessagesFab onPress={() => router.push('/chat/new-group')} />

      <FriendLivePreviewSheet
        visible={friendSheetVisible}
        onClose={() => setFriendSheetVisible(false)}
        friend={selectedFriend}
        live={previewLive}
        otherFriendsInLive={otherFriendsInLive}
      />

      <ReportComposerModal
        visible={Boolean(reportConversation)}
        loading={isSubmittingReport}
        title="Report user"
        subtitle="This sends the user and DM context into the moderation review queue."
        onClose={() => {
          if (isSubmittingReport) {
            return;
          }
          setReportConversation(null);
        }}
        onSubmit={async ({ reason, details }) => {
          if (!reportConversation) {
            return;
          }

          const otherUser = socialUsersById[reportConversation.otherUserId];
          setIsSubmittingReport(true);
          try {
            await submitReport({
              targetType: 'user',
              targetId: reportConversation.otherUserId,
              surface: 'dm_conversation_list',
              reason,
              details,
              context: {
                conversationId: reportConversation.id,
                otherUserId: reportConversation.otherUserId,
                otherUsername: otherUser?.username ?? null,
                lastMessageText: reportConversation.lastMessage.text ?? '',
                lastMessageCreatedAtMs: reportConversation.lastMessage.createdAt,
              },
            });
            setReportConversation(null);
            hapticConfirm();
            toast.success('Report sent.');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to send report.');
          } finally {
            setIsSubmittingReport(false);
          }
        }}
      />
    </AppScreen>
  );
}
