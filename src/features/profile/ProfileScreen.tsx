import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, UIManager, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { AppScreen, PillTabs } from '../../components';
import type { PillTabItem } from '../../components';
import { useAuth, useFriends, useWallet } from '../../context';
import { useUserProfile } from '../../context/UserProfileContext';
import { useLeaderboardRepo, useNotificationsRepo, useSocialRepo } from '../../data/provider';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import { useAuth as useSessionAuth } from '../../auth/spacetimeSession';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import { spacetimeDb, subscribeBootstrap } from '../../lib/spacetime';
import { hasAuthoritativeWallet } from '../../context/walletHydration';
import { colors, spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';
import { GemsBalanceCard } from './GemsBalanceCard';
import { MusicWidget } from './MusicWidget';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileHeader } from './ProfileHeader';
import { ProfileStats } from './ProfileStats';
import { PresenceStatusModal } from './PresenceStatusModal';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TabOption = 'wallet' | 'music';
const PROFILE_DIAGNOSTIC_THROTTLE_MS = 15_000;

export default function ProfileScreen() {
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useSessionAuth();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const { user } = useAuth();
  const { friends } = useFriends();
  const notificationsRepo = useNotificationsRepo();
  const leaderboardRepo = useLeaderboardRepo();
  const socialRepo = useSocialRepo();
  const { userProfile, updateUserProfile } = useUserProfile();
  const { gems, cash, fuel, walletHydrated, walletStateAvailable } = useWallet();
  const router = useRouter();
  const [isRankPublic, setIsRankPublic] = useState(true);
  const [activeTab, setActiveTab] = useState<TabOption>('wallet');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const socialStatusPersistWarnAtRef = useRef(0);

  useEffect(() => {
    if (!queriesEnabled) return;
    requestBackendRefresh();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeBootstrap();
  }, [queriesEnabled]);

  const notifications = useMemo(
    () => notificationsRepo.listNotifications({ limit: 120 }),
    [notificationsRepo],
  );
  const leaderboardItems = useMemo(
    () => leaderboardRepo.listLeaderboardItems({ limit: 300, includeCurrentUser: true }),
    [leaderboardRepo],
  );

  const profileName = userProfile.name || user?.displayName || userProfile.username || '';
  const profileImageUri = userProfile.avatarUrl || user?.photoURL || undefined;

  const profileStats = useMemo(() => {
    let addedYou = 0;
    let legacyViewedYou = 0;

    notifications.forEach((notification) => {
      if (
        notification.type === 'friend_request' &&
        notification.status === 'pending' &&
        notification.direction !== 'sent'
      ) {
        addedYou += 1;
      }
      if (notification.type === 'profile_view') {
        legacyViewedYou += notification.viewCount;
      }
    });

    const dbView = spacetimeDb.db as any;
    const metricsRows: any[] = Array.from(
      dbView?.myProfileViewMetrics?.iter?.() ?? dbView?.my_profile_view_metrics?.iter?.() ?? [],
    );
    const metricsRow = metricsRows[0] ?? null;
    const correctedViewedYouRaw = Number(metricsRow?.correctedTotalCount);
    const correctedViewedYou = Number.isFinite(correctedViewedYouRaw)
      ? Math.max(0, Math.floor(correctedViewedYouRaw))
      : legacyViewedYou;

    return {
      friends: friends.length,
      addedYou,
      viewedYou: correctedViewedYou,
    };
  }, [friends.length, notifications]);

  const currentRank = useMemo(() => {
    return leaderboardItems.find((item) => item.isCurrentUser || item.id === user?.uid)?.rank;
  }, [leaderboardItems, user?.uid]);

  const handleSettings = () => {
    router.push('/settings');
  };

  const handleEditProfile = () => {
    router.push('/edit-profile');
  };

  const handleBalancePress = () => {
    router.push('/(tabs)/shop');
  };

  const handleStatusPress = () => {
    hapticTap();
    setShowStatusModal(true);
  };

  const handleStatusApply = useCallback(
    (status: 'online' | 'busy' | 'offline', statusMessage?: string) => {
      updateUserProfile({ presenceStatus: status, statusMessage });

      if (!userId) {
        return;
      }

      void socialRepo
        .updateUserStatus({
          userId,
          status,
          statusText: statusMessage,
        })
        .catch((error) => {
          if (__DEV__) {
            void error;
            const now = Date.now();
            if (now - socialStatusPersistWarnAtRef.current >= PROFILE_DIAGNOSTIC_THROTTLE_MS) {
              socialStatusPersistWarnAtRef.current = now;
              console.warn('[profile][diag] persist_social_status_failed');
            }
          }
        });
    },
    [socialRepo, updateUserProfile, userId],
  );

  const handleFriendsPress = useCallback(() => {
    hapticTap();
    router.push('/friends');
  }, [router]);

  const handleFriendRequestsPress = useCallback(() => {
    hapticTap();
    router.push({
      pathname: '/(tabs)/notifications',
      params: {
        tab: 'requests',
        source: 'profile',
        ts: `${Date.now()}`,
      },
    });
  }, [router]);

  const handleViewedYouPress = useCallback(() => {
    hapticTap();
    router.push({
      pathname: '/(tabs)/notifications',
      params: {
        tab: 'activity',
        showProfileViews: '1',
        source: 'profile',
        ts: `${Date.now()}`,
      },
    });
  }, [router]);

  const tabItems = useMemo<PillTabItem[]>(
    () => [
      {
        key: 'wallet',
        label: 'Wallet',
        icon: 'wallet-outline',
      },
      {
        key: 'music',
        label: 'Music',
        icon: 'musical-notes-outline',
      },
    ],
    [],
  );

  const handleTabChange = useCallback((tab: string) => {
    hapticTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab as TabOption);
  }, []);

  const renderTabContent = () => {
    const showAuthoritativeWallet = hasAuthoritativeWallet(
      walletHydrated,
      walletStateAvailable,
    );

    switch (activeTab) {
      case 'wallet':
        return (
          <View style={styles.tabContent}>
            <GemsBalanceCard
              cashBalance={cash}
              gemsBalance={gems}
              fuelBalance={fuel}
              isLoading={!showAuthoritativeWallet}
              rank={currentRank}
              isRankPublic={isRankPublic}
              onToggleRankPrivacy={setIsRankPublic}
              onPress={handleBalancePress}
            />
          </View>
        );
      case 'music':
        return (
          <View style={styles.tabContent}>
            <MusicWidget />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <ProfileHeader onSettingsPress={handleSettings} />

      <View style={styles.topSection}>
        <View style={styles.avatarSection}>
          <ProfileAvatar
            imageUri={profileImageUri}
            name={profileName}
            onPress={handleEditProfile}
            status={userProfile.presenceStatus}
            statusMessage={userProfile.statusMessage}
            onStatusPress={handleStatusPress}
          />
        </View>

        <View style={styles.statsContainer}>
          <ProfileStats
            friends={profileStats.friends}
            addedYou={profileStats.addedYou}
            viewedYou={profileStats.viewedYou}
            onPressFriends={handleFriendsPress}
            onPressAddedYou={handleFriendRequestsPress}
            onPressViewedYou={handleViewedYouPress}
          />
        </View>
      </View>

      <View style={styles.tabBar}>
        <PillTabs
          items={tabItems}
          value={activeTab}
          onChange={handleTabChange}
          style={styles.tabPillContainer}
          tabItemStyle={styles.tabPillItem}
        />
      </View>

      <View style={styles.contentArea}>{renderTabContent()}</View>

      <PresenceStatusModal
        visible={showStatusModal}
        value={userProfile.presenceStatus}
        initialStatusMessage={userProfile.statusMessage}
        onClose={() => setShowStatusModal(false)}
        onApply={handleStatusApply}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  statsContainer: {
    marginBottom: spacing.sm,
  },
  tabBar: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tabPillContainer: {
    padding: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    gap: spacing.md,
  },
  tabPillItem: {
    paddingVertical: spacing.smMinus,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  tabContent: {
    flex: 1,
  },
});
