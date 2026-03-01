import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/auth/spacetimeSession';
import { useMemo } from 'react';

import { BottomBar } from '../../src/components/navigation/BottomBar';
import { FloatingMenuButton } from '../../src/components/navigation/FloatingMenuButton';
import { MiniPlayer } from '../../src/features/music/components/MiniPlayer';
import { FullPlayer } from '../../src/features/music/components/FullPlayer';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { useMessagesRepo, useNotificationsRepo } from '../../src/data/provider';

export default function TabsLayout() {
  const isAppActive = useAppIsActive();
  const {
    userId,
    isLoaded: isAuthLoaded,
    isSignedIn,
    hasSession,
    needsVerification,
  } = useAuth();
  const notificationsRepo = useNotificationsRepo();
  const messagesRepo = useMessagesRepo();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isAppActive;

  const localUnreadNotificationsCount = useMemo(() => {
    if (!queriesEnabled) return 0;
    const unread = notificationsRepo.listNotifications({
      unreadOnly: true,
      limit: 240,
      userId: userId ?? undefined,
    });
    return unread.filter(
      (item) => item.type !== 'friend_request' || item.direction !== 'sent',
    ).length;
  }, [notificationsRepo, queriesEnabled, userId]);

  const localUnreadMessagesCount = useMemo(() => {
    if (!queriesEnabled) return 0;
    return messagesRepo
      .listConversations({ limit: 300 })
      .reduce((total, conversation) => total + Math.max(0, conversation.unreadCount ?? 0), 0);
  }, [messagesRepo, queriesEnabled]);

  const mergedUnreadNotificationsCount = queriesEnabled ? localUnreadNotificationsCount : 0;
  const mergedUnreadMessagesCount = queriesEnabled ? localUnreadMessagesCount : 0;

  if (isAuthLoaded && hasSession && needsVerification) {
    return <Redirect href="/(auth)/verify-email" />;
  }

  if (isAuthLoaded && !hasSession) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="play" options={{ title: 'Play' }} />
        <Tabs.Screen name="videos" options={{ title: 'Videos' }} />
        <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
        <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>

      <MiniPlayer />
      <FullPlayer />
      <BottomBar
        notificationsBadgeCount={mergedUnreadNotificationsCount}
        messagesBadgeCount={mergedUnreadMessagesCount}
      />
      <FloatingMenuButton />
    </>
  );
}
