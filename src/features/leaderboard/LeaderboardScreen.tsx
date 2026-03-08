import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { AppScreen, AppText } from '../../components';
import { spacing } from '../../theme';
import { useWallet } from '../../context';
import { useProfile } from '../../context/ProfileContext';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile } from '../../context/UserProfileContext';
import { useFriendshipsRepo, useLeaderboardRepo } from '../../data/provider';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import { hapticTap } from '../../utils/haptics';
import type { LiveUser } from '../liveroom/types';
import { LeaderboardEmptyState } from './components/LeaderboardEmptyState';
import { LeaderboardItemRow } from './components/LeaderboardItemRow';
import { LeaderboardListHeader } from './components/LeaderboardListHeader';
import type { LeaderboardItem } from './types';
import {
  getSpacetimeTelemetrySnapshot,
  subscribeBootstrap,
  subscribeSpacetimeTelemetry,
} from '../../lib/spacetime';
import {
  buildCurrentUserPreviewEntry,
  buildVisibleLeaderboardItems,
  deriveCurrentUserLabels,
  getMeScopeSummary,
} from './viewModel';

type LeaderboardScope = 'all' | 'friends' | 'me';
type EmptyStateConfig = {
  iconName: React.ComponentProps<typeof LeaderboardEmptyState>['iconName'];
  title: string;
  message: string;
  loading?: boolean;
};

export function LeaderboardScreen() {
  const { showProfile } = useProfile();
  const isFocused = useIsFocused();
  const { user, initializing } = useAuth();
  const { userProfile } = useUserProfile();
  const { cash } = useWallet();
  const friendshipsRepo = useFriendshipsRepo();
  const leaderboardRepo = useLeaderboardRepo();
  const [isPublic, setIsPublic] = useState(true);
  const [scope, setScope] = useState<LeaderboardScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [telemetrySnapshot, setTelemetrySnapshot] = useState(() =>
    getSpacetimeTelemetrySnapshot(),
  );
  const queriesEnabled = !initializing && !!user?.uid && isFocused;

  useEffect(() => subscribeSpacetimeTelemetry(setTelemetrySnapshot), []);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    requestBackendRefresh();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeBootstrap();
  }, [queriesEnabled]);

  const acceptedFriendIds = useMemo(
    () => new Set(queriesEnabled ? friendshipsRepo.listAcceptedFriendIds() : []),
    [friendshipsRepo, queriesEnabled],
  );

  const rawLeaderboardData = useMemo(
    () =>
      queriesEnabled
        ? leaderboardRepo.listLeaderboardItems({ limit: 200, includeCurrentUser: true })
        : [],
    [leaderboardRepo, queriesEnabled],
  );

  const leaderboardData = useMemo(() => {
    const currentUserLabels = deriveCurrentUserLabels(user, userProfile);
    return rawLeaderboardData.map((item) => {
      const isCurrentUser =
        item.isCurrentUser || item.id === user?.uid || item.id === userProfile.id;
      if (!isCurrentUser) {
        return {
          ...item,
          isFriend: item.isFriend ?? acceptedFriendIds.has(item.id),
        };
      }

      return {
        ...item,
        displayName: currentUserLabels.displayName,
        username: currentUserLabels.username,
        avatarUrl: currentUserLabels.avatarUrl || item.avatarUrl,
        isCurrentUser: true,
        isFriend: false,
      };
    });
  }, [
    acceptedFriendIds,
    cash,
    rawLeaderboardData,
    user,
    userProfile,
  ]);

  const currentUserEntry = useMemo(
    () =>
      leaderboardData.find(
        (item) => item.isCurrentUser || item.id === user?.uid || item.id === userProfile.id,
      ) ?? null,
    [leaderboardData, user?.uid, userProfile.id],
  );
  const currentUserPreview = useMemo(
    () =>
      buildCurrentUserPreviewEntry({
        currentUserEntry,
        user,
        userProfile,
        cashAmount: cash,
      }),
    [cash, currentUserEntry, user, userProfile],
  );

  const filteredData = useMemo(() => {
    return buildVisibleLeaderboardItems({
      scope,
      isPublic,
      searchQuery,
      leaderboardData,
      currentUserPreview,
      currentUserId: user?.uid ?? userProfile.id,
      acceptedFriendIds,
    });
  }, [
    acceptedFriendIds,
    currentUserPreview,
    isPublic,
    leaderboardData,
    scope,
    searchQuery,
    user?.uid,
    userProfile.id,
  ]);

  const isConnecting =
    telemetrySnapshot.connectionState === 'idle' ||
    telemetrySnapshot.connectionState === 'connecting' ||
    telemetrySnapshot.subscriptionState === 'idle' ||
    telemetrySnapshot.subscriptionState === 'subscribing';
  const hasConnectionError =
    telemetrySnapshot.connectionState === 'disconnected' ||
    telemetrySnapshot.connectionState === 'error' ||
    telemetrySnapshot.subscriptionState === 'error';
  const isInitialLoad = queriesEnabled && rawLeaderboardData.length === 0 && isConnecting;
  const isReconnectState = queriesEnabled && rawLeaderboardData.length > 0 && !(
    telemetrySnapshot.connectionState === 'connected' &&
    telemetrySnapshot.subscriptionState === 'active'
  );

  const summaryText = useMemo(() => {
    if (scope === 'me') {
      return getMeScopeSummary(currentUserPreview, isPublic);
    }

    if (scope === 'friends') {
      return filteredData.length === 1
        ? '1 friend ranked right now.'
        : `${filteredData.length} friends ranked right now.`;
    }

    return filteredData.length === 1
      ? '1 ranked profile in the current view.'
      : `${filteredData.length} ranked profiles in the current view.`;
  }, [currentUserPreview, filteredData.length, isPublic, scope]);

  const statusLabel = useMemo(() => {
    if (isReconnectState) {
      return 'Leaderboard is reconnecting. Rows on screen are the latest hydrated snapshot.';
    }
    if (queriesEnabled && rawLeaderboardData.length === 0 && hasConnectionError) {
      return 'Leaderboard connection dropped before rows arrived. Stay here and it will retry.';
    }
    return null;
  }, [hasConnectionError, isReconnectState, queriesEnabled, rawLeaderboardData.length]);

  const emptyState = useMemo<EmptyStateConfig>(() => {
    if (isInitialLoad) {
      return {
        iconName: 'sync-outline',
        title: 'Syncing leaderboard',
        message: 'Waiting for ranked profiles to hydrate from the live snapshot.',
        loading: true,
      };
    }

    if (queriesEnabled && rawLeaderboardData.length === 0 && hasConnectionError) {
      return {
        iconName: 'cloud-offline-outline',
        title: 'Leaderboard reconnecting',
        message: 'No leaderboard rows arrived before the connection dropped.',
      };
    }

    if (searchQuery.trim()) {
      return {
        iconName: 'search-outline',
        title: 'No matching players',
        message: 'Try a different display name or username.',
      };
    }

    if (scope === 'friends') {
      return {
        iconName: 'people-outline',
        title: 'No ranked friends yet',
        message: 'Friends will appear here as soon as they have leaderboard rows.',
      };
    }

    if (scope === 'me') {
      return {
        iconName: 'person-outline',
        title: isPublic ? 'Your rank is not available yet' : 'You are hidden from the leaderboard',
        message: isPublic
          ? 'Your personal row stays visible here while the authoritative rank finishes hydrating.'
          : 'Turn Public Profile back on to show your row to other players. Your personal view stays here.',
      };
    }

    return {
      iconName: 'trophy-outline',
      title: 'No leaderboard rows yet',
      message: 'Ranked profiles will appear here when the snapshot is populated.',
    };
  }, [
    hasConnectionError,
    isInitialLoad,
    queriesEnabled,
    rawLeaderboardData.length,
    scope,
    searchQuery,
  ]);

  const handleItemPress = useCallback(
    (item: LeaderboardItem) => {
      hapticTap();
      const isSelfPreview =
        item.isCurrentUser || item.id === user?.uid || item.id === userProfile.id;
      const liveUser: LiveUser = {
        id: item.id,
        name: isSelfPreview
          ? userProfile.name || user?.displayName || userProfile.username || item.displayName
          : item.displayName,
        username: isSelfPreview ? userProfile.username || item.username : item.username,
        avatarUrl: isSelfPreview
          ? userProfile.avatarUrl || user?.photoURL || item.avatarUrl
          : item.avatarUrl,
        age: isSelfPreview ? userProfile.age : 0,
        verified: Boolean(user?.emailVerified && isSelfPreview),
        country: isSelfPreview ? userProfile.country : '',
        bio: isSelfPreview ? userProfile.bio : '',
        photos: isSelfPreview ? userProfile.photos.map((photo) => photo.uri) : undefined,
        isFriend: acceptedFriendIds.has(item.id),
        isSelfPreview,
      };
      showProfile(liveUser);
    },
    [
      acceptedFriendIds,
      showProfile,
      user?.displayName,
      user?.emailVerified,
      user?.photoURL,
      user?.uid,
      userProfile.age,
      userProfile.avatarUrl,
      userProfile.bio,
      userProfile.country,
      userProfile.id,
      userProfile.name,
      userProfile.photos,
      userProfile.username,
    ],
  );

  const handleScopeChange = useCallback((value: string) => {
    hapticTap();
    setScope(value as LeaderboardScope);
  }, []);
  const handleTogglePrivacy = useCallback((value: boolean) => {
    hapticTap();
    setIsPublic(value);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LeaderboardItem }) => (
      <LeaderboardItemRow item={item} onPress={handleItemPress} />
    ),
    [handleItemPress],
  );

  const headerComponent = useMemo(
    () => (
      <LeaderboardListHeader
        isPublic={isPublic}
        onToggle={handleTogglePrivacy}
        scopeValue={scope}
        onScopeChange={handleScopeChange}
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        onClearSearch={handleClearSearch}
        summary={summaryText}
        statusLabel={statusLabel}
      />
    ),
    [
      handleClearSearch,
      handleScopeChange,
      handleSearchChange,
      handleTogglePrivacy,
      isPublic,
      scope,
      searchQuery,
      statusLabel,
      summaryText,
    ],
  );

  const emptyComponent = useMemo(
    () => (
      <LeaderboardEmptyState
        iconName={emptyState.iconName}
        title={emptyState.title}
        message={emptyState.message}
        loading={emptyState.loading}
      />
    ),
    [emptyState.iconName, emptyState.loading, emptyState.message, emptyState.title],
  );

  return (
    <AppScreen noPadding style={styles.screen}>
      <View style={styles.header}>
        <AppText variant="h1">Leaderboard</AppText>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={headerComponent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={emptyComponent}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl * 4,
  },
});
