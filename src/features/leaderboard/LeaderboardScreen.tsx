import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { AppScreen, AppText } from '../../components';
import { spacing } from '../../theme';
import { useProfile } from '../../context/ProfileContext';
import { useWallet } from '../../context';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile } from '../../context/UserProfileContext';
import { useLeaderboardRepo } from '../../data/provider';
import { hapticTap } from '../../utils/haptics';
import type { LiveUser } from '../liveroom/types';
import { LeaderboardEmptyState } from './components/LeaderboardEmptyState';
import { LeaderboardItemRow } from './components/LeaderboardItemRow';
import { LeaderboardListHeader } from './components/LeaderboardListHeader';
import type { LeaderboardItem } from './types';
import { subscribeBootstrap } from '../../lib/spacetime';

export function LeaderboardScreen() {
  const { showProfile } = useProfile();
  const isFocused = useIsFocused();
  const { user, initializing } = useAuth();
  const { userProfile } = useUserProfile();
  const { cash } = useWallet();
  const leaderboardRepo = useLeaderboardRepo();
  const staticLeaderboardData = useMemo(
    () =>
      initializing || !user?.uid || !isFocused
        ? []
        : leaderboardRepo.listLeaderboardItems({ limit: 200, includeCurrentUser: true }),
    [initializing, isFocused, leaderboardRepo, user?.uid],
  );
  const [isPublic, setIsPublic] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    return subscribeBootstrap();
  }, [isFocused]);

  const leaderboardData = useMemo(() => {
    const existingCurrentUser = staticLeaderboardData.find(
      (item) => item.isCurrentUser || item.id === user?.uid || item.id === userProfile.id,
    );

    const currentUser: LeaderboardItem = {
      id: user?.uid || userProfile.id,
      rank: existingCurrentUser?.rank ?? staticLeaderboardData.length + 1,
      displayName: userProfile.name || user?.displayName || userProfile.username || '',
      username: userProfile.username || '',
      avatarUrl: userProfile.avatarUrl || user?.photoURL || '',
      cashAmount: cash,
      isCurrentUser: true,
      isFriend: false,
    };

    if (existingCurrentUser) {
      return staticLeaderboardData.map((item) => (item.id === existingCurrentUser.id ? currentUser : item));
    }

    return [...staticLeaderboardData, currentUser];
  }, [
    cash,
    staticLeaderboardData,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    userProfile.id,
    userProfile.name,
    userProfile.username,
    userProfile.avatarUrl,
  ]);

  const filteredData = useMemo(() => {
    let data = leaderboardData;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      data = data.filter(
        (item) =>
          item.displayName.toLowerCase().includes(query) ||
          item.username.toLowerCase().includes(query),
      );
    }

    if (!isPublic) {
      data = data.filter((item) => !item.isCurrentUser);
    }

    return data;
  }, [searchQuery, isPublic, leaderboardData]);

  const handleItemPress = useCallback(
    (item: LeaderboardItem) => {
      hapticTap();
      const liveUser: LiveUser = {
        id: item.id,
        name: item.displayName,
        username: item.username,
        avatarUrl: item.avatarUrl,
        age: item.isCurrentUser ? userProfile.age : 0,
        verified: false,
        country: item.isCurrentUser ? userProfile.country : '',
        bio: item.isCurrentUser ? userProfile.bio : '',
        isFriend: item.isFriend,
      };
      showProfile(liveUser);
    },
    [showProfile, userProfile.age, userProfile.bio, userProfile.country],
  );

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
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        onClearSearch={handleClearSearch}
      />
    ),
    [handleClearSearch, handleSearchChange, handleTogglePrivacy, isPublic, searchQuery],
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
        ListEmptyComponent={<LeaderboardEmptyState />}
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
