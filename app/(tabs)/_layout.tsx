import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/auth/spacetimeSession';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { BottomBar } from '../../src/components/navigation/BottomBar';
import { FloatingMenuButton } from '../../src/components/navigation/FloatingMenuButton';
import { MiniPlayer } from '../../src/features/music/components/MiniPlayer';
import { FullPlayer } from '../../src/features/music/components/FullPlayer';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { useMessagesRepo, useNotificationsRepo } from '../../src/data/provider';
import { createBackendHttpClientFromEnv } from '../../src/data/adapters/backend/httpClient';
import { subscribeBackendRefresh } from '../../src/data/adapters/backend/refreshBus';
import { getBackendToken } from '../../src/utils/backendToken';
import { getBackendTokenTemplate } from '../../src/config/backendToken';

export default function TabsLayout() {
  const isAppActive = useAppIsActive();
  const {
    userId,
    isLoaded: isAuthLoaded,
    isSignedIn,
    hasSession,
    needsVerification,
    getToken,
  } = useAuth();
  const notificationsRepo = useNotificationsRepo();
  const messagesRepo = useMessagesRepo();
  const [backendClient] = useState(() => createBackendHttpClientFromEnv());
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isAppActive;
  const tokenTemplate = useMemo(() => getBackendTokenTemplate(), []);

  const loadUnreadCounts = useCallback(async () => {
    if (!queriesEnabled || !backendClient) {
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      return;
    }

    try {
      const token = await getBackendToken(getToken, tokenTemplate);
      if (!token) return;
      backendClient.setAuth(token);
      const payload = await backendClient.get<{
        unreadMessages?: number;
        unreadNotifications?: number;
      }>('/counts/unread');

      setUnreadMessagesCount(
        typeof payload.unreadMessages === 'number' ? payload.unreadMessages : 0,
      );
      setUnreadNotificationsCount(
        typeof payload.unreadNotifications === 'number' ? payload.unreadNotifications : 0,
      );
    } catch (error) {
      if (__DEV__) {
        console.warn('[tabs] Failed to load unread counts', error);
      }
    }
  }, [backendClient, getToken, queriesEnabled, tokenTemplate]);

  useEffect(() => {
    if (!queriesEnabled) {
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      return;
    }

    void loadUnreadCounts();
  }, [loadUnreadCounts, queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) return;

    const unsubscribe = subscribeBackendRefresh(() => {
      void loadUnreadCounts();
    });

    return () => {
      unsubscribe();
    };
  }, [loadUnreadCounts, queriesEnabled]);

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

  const mergedUnreadNotificationsCount = queriesEnabled
    ? Math.max(unreadNotificationsCount, localUnreadNotificationsCount)
    : 0;
  const mergedUnreadMessagesCount = queriesEnabled
    ? Math.max(unreadMessagesCount, localUnreadMessagesCount)
    : 0;

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
