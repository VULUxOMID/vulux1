import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { AppScreen } from '../../components';
import { useProfile } from '../../context/ProfileContext';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile } from '../../context/UserProfileContext';
import { useLeaderboardRepo } from '../../data/provider';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import { useAuth as useSessionAuth } from '../../auth/clerkSession';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import {
  getRailwayTelemetrySnapshot,
  subscribeLeaderboard,
  subscribeRailwayTelemetry,
} from '../../lib/railwayRuntime';
import { spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';
import type { LiveUser } from '../liveroom/types';
import { LeaderboardEmptyState } from './components/LeaderboardEmptyState';
import { LeaderboardItemRow } from './components/LeaderboardItemRow';
import { LeaderboardListHeader } from './components/LeaderboardListHeader';
import type { LeaderboardItem } from './types';

type LeaderboardScope = 'all' | 'friends' | 'me';
type LeaderboardStatusTone = 'loading' | 'reconnect' | 'info' | null;

export function LeaderboardScreen() {
  const { showProfile } = useProfile();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { user } = useAuth();
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    userId: sessionUserId,
  } = useSessionAuth();
  const { userProfile } = useUserProfile();
  const leaderboardRepo = useLeaderboardRepo();
  const [telemetry, setTelemetry] = useState(getRailwayTelemetrySnapshot());
  const [scope, setScope] = useState<LeaderboardScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const queriesEnabled = isAuthLoaded && isSignedIn && !!sessionUserId && isFocused && isAppActive;
  const currentUserId = sessionUserId ?? user?.uid ?? userProfile.id;

  useEffect(() => subscribeRailwayTelemetry(setTelemetry), []);

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
    return subscribeLeaderboard();
  }, [queriesEnabled]);

  const authoritativeRows = useMemo(
    () =>
      queriesEnabled
        ? [...leaderboardRepo.listLeaderboardItems({ limit: 200, includeCurrentUser: true })].sort(
            (left, right) => left.rank - right.rank,
          )
        : [],
    [leaderboardRepo, queriesEnabled],
  );

  const leaderboardData = useMemo(() => {
    return authoritativeRows.map((item) => {
      const isCurrentUser = !!currentUserId && item.id === currentUserId;
      if (!isCurrentUser && !item.isCurrentUser) {
        return item;
      }

      return {
        ...item,
        displayName:
          item.displayName ||
          userProfile.name ||
          user?.displayName ||
          userProfile.username ||
          item.username ||
          'You',
        username: item.username || userProfile.username || '',
        avatarUrl: item.avatarUrl || userProfile.avatarUrl || user?.photoURL || '',
        isCurrentUser: true,
      };
    });
  }, [
    authoritativeRows,
    currentUserId,
    user?.displayName,
    user?.photoURL,
    userProfile.avatarUrl,
    userProfile.name,
    userProfile.username,
  ]);

  const currentUserRow = useMemo(
    () =>
      leaderboardData.find(
        (item) => item.isCurrentUser || (!!currentUserId && item.id === currentUserId),
      ) ?? null,
    [currentUserId, leaderboardData],
  );

  const filteredData = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return leaderboardData.filter((item) => {
      if (scope === 'friends' && !item.isFriend) {
        return false;
      }
      if (scope === 'me' && !item.isCurrentUser) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        item.displayName.toLowerCase().includes(normalizedQuery) ||
        item.username.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [leaderboardData, scope, searchQuery]);

  const rankedCount = leaderboardData.length;
  const friendRankedCount = useMemo(
    () => leaderboardData.filter((item) => item.isFriend).length,
    [leaderboardData],
  );

  const isLoading =
    queriesEnabled &&
    rankedCount === 0 &&
    (telemetry.connectionState === 'connecting' ||
      telemetry.subscriptionState === 'idle' ||
      telemetry.subscriptionState === 'subscribing');

  const isReconnecting =
    queriesEnabled &&
    rankedCount > 0 &&
    (telemetry.connectionState !== 'connected' || telemetry.subscriptionState !== 'active');

  const status = useMemo<{
    tone: LeaderboardStatusTone;
    title: string;
    message: string;
  }>(() => {
    if (isLoading) {
      return {
        tone: 'loading',
        title: 'Loading live ranking',
        message: 'Waiting for the ranked snapshot to hydrate on this device.',
      };
    }

    if (isReconnecting) {
      return {
        tone: 'reconnect',
        title: 'Reconnecting leaderboard',
        message: 'Showing the last synced list while realtime catches back up.',
      };
    }

    if (rankedCount > 0 && !currentUserRow && queriesEnabled) {
      return {
        tone: 'info',
        title: 'Your row is still syncing',
        message: 'The leaderboard is loaded, but your own rank row is not present yet.',
      };
    }

    return {
      tone: null,
      title: '',
      message: '',
    };
  }, [currentUserRow, isLoading, isReconnecting, queriesEnabled, rankedCount]);

  const handleItemPress = useCallback(
    (item: LeaderboardItem) => {
      hapticTap();
      const isSelfPreview =
        item.isCurrentUser ||
        (!!currentUserId && item.id === currentUserId) ||
        item.id === userProfile.id;

      const liveUser: LiveUser = {
        id: item.id,
        name:
          item.displayName ||
          (isSelfPreview ? userProfile.name || user?.displayName || userProfile.username : '') ||
          item.username ||
          item.id,
        username:
          item.username ||
          (isSelfPreview ? userProfile.username : '') ||
          item.displayName ||
          item.id,
        avatarUrl:
          item.avatarUrl ||
          (isSelfPreview ? userProfile.avatarUrl || user?.photoURL || '' : ''),
        age: isSelfPreview ? userProfile.age : 0,
        verified: false,
        country: isSelfPreview ? userProfile.country : '',
        bio: isSelfPreview ? userProfile.bio : '',
        isFriend: item.isFriend,
        isSelfPreview,
        photos: isSelfPreview
          ? userProfile.photos
              .map((photo) => photo.uri)
              .filter((uri) => typeof uri === 'string' && uri.trim().length > 0)
          : undefined,
      };
      showProfile(liveUser);
    },
    [
      currentUserId,
      showProfile,
      user?.displayName,
      user?.photoURL,
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

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleScopeChange = useCallback((value: LeaderboardScope) => {
    hapticTap();
    setScope(value);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setScope('all');
  }, []);

  const emptyState = useMemo(() => {
    if (isLoading) {
      return (
        <LeaderboardEmptyState
          loading
          title="Loading leaderboard"
          message="Waiting for ranked rows from the active signed-in snapshot."
        />
      );
    }

    if (searchQuery.trim().length > 0) {
      return (
        <LeaderboardEmptyState
          icon="search-outline"
          title="No matching players"
          message="Try a different display name or username, or clear the search."
          actionLabel="Clear search"
          onAction={handleClearSearch}
        />
      );
    }

    if (scope === 'friends') {
      return (
        <LeaderboardEmptyState
          icon="people-outline"
          title="No ranked friends yet"
          message="Friends will appear here once they have live leaderboard rows."
          actionLabel="Show all"
          onAction={handleResetFilters}
        />
      );
    }

    if (scope === 'me') {
      return (
        <LeaderboardEmptyState
          icon="person-outline"
          title="Your row is not on the board yet"
          message="The leaderboard is live, but your own ranked row has not hydrated yet."
          actionLabel="Show all"
          onAction={handleResetFilters}
        />
      );
    }

    return (
      <LeaderboardEmptyState
        icon="trophy-outline"
        title="No leaderboard rows yet"
        message="Rankings appear here when the public leaderboard snapshot has data."
      />
    );
  }, [handleClearSearch, handleResetFilters, isLoading, scope, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: LeaderboardItem }) => (
      <LeaderboardItemRow item={item} onPress={handleItemPress} />
    ),
    [handleItemPress],
  );

  const headerComponent = useMemo(
    () => (
      <LeaderboardListHeader
        rankedCount={rankedCount}
        friendRankedCount={friendRankedCount}
        currentRank={currentUserRow?.rank ?? null}
        scope={scope}
        onScopeChange={handleScopeChange}
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        onClearSearch={handleClearSearch}
        statusTone={status.tone}
        statusTitle={status.title}
        statusMessage={status.message}
      />
    ),
    [
      currentUserRow?.rank,
      friendRankedCount,
      handleClearSearch,
      handleScopeChange,
      handleSearchChange,
      rankedCount,
      scope,
      searchQuery,
      status.message,
      status.title,
      status.tone,
    ],
  );

  return (
    <AppScreen noPadding style={styles.screen}>
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          filteredData.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={headerComponent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={emptyState}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl * 4,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
});
