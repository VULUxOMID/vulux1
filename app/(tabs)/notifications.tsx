import React, { useCallback, useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/spacetimeSession';
import { useIsFocused } from '@react-navigation/native';

import { NotificationPage } from '../../src/features/notifications';
import type { FriendRequestNotification } from '../../src/features/notifications/types';
import { useNotificationsRepo } from '../../src/data/provider';
import { requestBackendRefresh } from '../../src/data/adapters/backend/refreshBus';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { subscribeFriends } from '../../src/lib/spacetime';

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
    return notificationsRepo.listNotifications({ userId, limit: 150 });
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

  const resolveLiveRoomId = useCallback((action: any): string | null => {
    const metadata =
      action?.metadata && typeof action.metadata === 'object' ? action.metadata : undefined;
    const possibleRoomId =
      action?.liveId ??
      action?.roomId ??
      action?.chatId ??
      action?.streamId ??
      metadata?.liveId ??
      metadata?.roomId ??
      metadata?.chatId ??
      metadata?.streamId;
    const roomId = typeof possibleRoomId === 'string' ? possibleRoomId.trim() : '';

    if (!roomId || roomId.toLowerCase() === 'global') {
      return null;
    }

    return roomId;
  }, []);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeFriends();
  }, [queriesEnabled]);

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
              ...(action.messageId && { messageId: action.messageId })
            }
          });
        } else if (action?.type === 'open_chat') {
          const liveRoomId = resolveLiveRoomId(action);
          if (liveRoomId) {
            router.push({
              pathname: '/live',
              params: { id: liveRoomId },
            });
            break;
          }

          // Navigate to global chat
          const messageId = action.messageId ?? action.metadata?.messageId;
          const replyToMessageId = action.replyToMessageId;
          console.log('Navigating to Chat:', messageId);
          
          if (messageId) {
            router.push({
              pathname: '/(tabs)',
              params: {
                openChat: 'true',
                messageId,
                ...(replyToMessageId && { replyToMessageId }),
              }
            });
          } else {
            router.push({
              pathname: '/(tabs)',
              params: {
                openChat: 'true',
                ...(replyToMessageId && { replyToMessageId }),
              }
            });
          }
        } else if (action?.type === 'explore') {
          router.push('/(tabs)');
        } else if (action?.type === 'open_live' && typeof action.liveId === 'string') {
          router.push({
            pathname: '/live',
            params: { id: action.liveId },
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
        if (action === 'view_profile') {
          console.log('Navigate to profile:', id);
        }
        break;
      case 'activity':
        switch (action?.type) {
          case 'open_chat':
            console.log('Open chat:', action.metadata);
            break;
          case 'open_rewards':
            console.log('Open rewards');
            break;
          case 'open_trades':
            console.log('Open trades');
            break;
          case 'join_live':
            console.log('Join live room:', action.userId);
            break;
        }
        break;
    }
  }, [notifications, notificationsRepo, resolveLiveRoomId, router]);

  const handleRefresh = useCallback(async () => {
    requestBackendRefresh();
  }, []);

  return (
    <NotificationPage
      notifications={notifications}
      onNotificationAction={handleNotificationAction}
      onRefresh={handleRefresh}
      loading={loading}
      initialTab={initialTab}
      openProfileViewsOnMount={openProfileViewsOnMount}
    />
  );
}
