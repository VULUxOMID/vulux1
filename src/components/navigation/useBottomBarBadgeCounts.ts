import { useMemo } from 'react';

import { useAuth } from '../../auth/clerkSession';
import { useMessagesRepo, useNotificationsRepo } from '../../data/provider';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import { NOTIFICATION_FEED_LIMIT } from '../../features/notifications/constants';
import { countsTowardUnreadNotificationBadges } from '../../features/notifications/unreadBadgeState';

export function useBottomBarBadgeCounts() {
  const isAppActive = useAppIsActive();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const notificationsRepo = useNotificationsRepo();
  const messagesRepo = useMessagesRepo();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isAppActive;

  const notificationsBadgeCount = useMemo(() => {
    if (!queriesEnabled) return 0;
    const unread = notificationsRepo.listNotifications({
      unreadOnly: true,
      limit: NOTIFICATION_FEED_LIMIT,
      userId: userId ?? undefined,
    });
    return unread.filter(countsTowardUnreadNotificationBadges).length;
  }, [notificationsRepo, queriesEnabled, userId]);

  const messagesBadgeCount = useMemo(() => {
    if (!queriesEnabled) return 0;
    return messagesRepo
      .listConversations({ limit: 300 })
      .reduce((total, conversation) => total + Math.max(0, conversation.unreadCount ?? 0), 0);
  }, [messagesRepo, queriesEnabled]);

  return {
    notificationsBadgeCount: queriesEnabled ? notificationsBadgeCount : 0,
    messagesBadgeCount: queriesEnabled ? messagesBadgeCount : 0,
  };
}
