import React, { useCallback, useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/clerkSession';
import { useIsFocused } from '@react-navigation/native';

import { NotificationPage } from '../../src/features/notifications';
import { NOTIFICATION_FEED_LIMIT } from '../../src/features/notifications/constants';
import type { FriendRequestNotification } from '../../src/features/notifications/types';
import { useNotificationsRepo } from '../../src/data/provider';
import { requestBackendRefresh } from '../../src/data/adapters/backend/refreshBus';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { subscribeFriends } from '../../src/lib/railwayRuntime';

export default function NotificationsScreen() {
  const router = useRouter();
  const isAppActive = useAppIsActive();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    showProfileViews?: string | string[];
  }>();
  const isFocused = useIsFocused();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const notificationsRepo = useNotificationsRepo();
  const notifications = useMemo(() => {
    if (!queriesEnabled) {
      return [];
    }
    return notificationsRepo.listNotifications({ userId, limit: NOTIFICATION_FEED_LIMIT });
  }, [notificationsRepo, queriesEnabled, userId]);
  const loading = false;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab =
    tabParam === 'requests' || tabParam === 'mentions' || tabParam === 'activity'
      ? tabParam
      : 'requests';
  const profileViewsParam = Array.isArray(params.showProfileViews)
    ? params.showProfileViews[0]
    : params.showProfileViews;
  const openProfileViewsOnMount =
    profileViewsParam === '1' || profileViewsParam?.toLowerCase() === 'true';

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeFriends();
  }, [queriesEnabled]);

  const openGlobalChat = useCallback(
    (options?: { messageId?: string; replyToMessageId?: string }) => {
      router.push({
        pathname: '/(tabs)',
        params: {
          openChat: 'true',
          ...(options?.messageId ? { messageId: options.messageId } : {}),
          ...(options?.replyToMessageId ? { replyToMessageId: options.replyToMessageId } : {}),
        },
      });
    },
    [router],
  );

  const openLive = useCallback(
    (liveId: string | null | undefined, options?: { eventMessageId?: string }) => {
      if (typeof liveId !== 'string' || liveId.trim().length === 0) {
        return;
      }
      router.push({
        pathname: '/live',
        params: {
          id: liveId.trim(),
          ...(options?.eventMessageId ? { eventMessageId: options.eventMessageId } : {}),
        },
      });
    },
    [router],
  );

  const handleNotificationAction = useCallback(async (type: string, id: string, action: any) => {
    switch (type) {
      case 'mark_all_read':
        await notificationsRepo.markAllRead();
        break;
      case 'mark_read':
        await notificationsRepo.markRead({ notificationId: id });
        break;
      case 'delete':
        await notificationsRepo.deleteNotification({ notificationId: id });
        break;
      case 'navigation':
        if (action?.type === 'open_dm') {
          // Navigate to DM with specific user and optionally scroll to message
          router.push({
            pathname: '/chat/[userId]',
            params: { 
              userId: action.userId,
              ...(action.messageId && { messageId: action.messageId }),
              ...(action.replyToMessageId && { replyToMessageId: action.replyToMessageId }),
            }
          });
        } else if (action?.type === 'open_room') {
          router.push({
            pathname: '/chat/room/[roomId]',
            params: {
              roomId: action.roomId,
              ...(action.messageId && { messageId: action.messageId }),
              ...(action.replyToMessageId && { replyToMessageId: action.replyToMessageId }),
            },
          });
        } else if (action?.type === 'open_chat') {
          const messageId = action.messageId ?? action.metadata?.messageId;
          const replyToMessageId = action.replyToMessageId;
          openGlobalChat({ messageId, replyToMessageId });
        } else if (action?.type === 'explore') {
          router.push('/(tabs)');
        } else if (action?.type === 'open_live' && typeof action.liveId === 'string') {
          openLive(action.liveId, {
            eventMessageId:
              typeof action.eventMessageId === 'string' ? action.eventMessageId : undefined,
          });
        }
        break;
      case 'friend_request':
        if (action === 'accept') {
          await notificationsRepo.respondToFriendRequest({
            notificationId: id,
            status: 'accepted',
          });
        } else if (action === 'decline') {
          await notificationsRepo.respondToFriendRequest({
            notificationId: id,
            status: 'declined',
          });
        } else if (action === 'cancel') {
          const notification = notifications.find(
            (item): item is FriendRequestNotification =>
              item.id === id && item.type === 'friend_request',
          );
          const otherUserId = notification?.fromUser.id;
          if (!otherUserId) {
            throw new Error('Unable to cancel friend request: target user is missing.');
          }
          await notificationsRepo.removeFriendRelationship({ otherUserId });
        }
        break;
      case 'profile_view':
        break;
      case 'activity':
        switch (action?.type) {
          case 'open_chat':
            openGlobalChat({
              messageId: action.messageId ?? action.metadata?.messageId,
              replyToMessageId: action.replyToMessageId ?? action.metadata?.replyToMessageId,
            });
            break;
          case 'open_rewards':
          case 'open_trades':
            break;
          case 'join_live':
            openLive(action.liveId ?? action.metadata?.liveId ?? action.userId);
            break;
        }
        break;
    }
  }, [notifications, notificationsRepo, openGlobalChat, openLive, router]);

  const handleRefresh = useCallback(async () => {
    requestBackendRefresh();
  }, []);

  return (
    <NotificationPage
      notifications={notifications}
      onNotificationAction={handleNotificationAction}
      onClearAll={() => notificationsRepo.markAllRead()}
      onRefresh={handleRefresh}
      loading={loading}
      initialTab={initialTab}
      openProfileViewsOnMount={openProfileViewsOnMount}
    />
  );
}
