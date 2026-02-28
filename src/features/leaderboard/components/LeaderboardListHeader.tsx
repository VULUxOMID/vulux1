import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../theme';
import { LeaderboardSearchBar } from './LeaderboardSearchBar';
import { LeaderboardTitle } from './LeaderboardTitle';
import { PrivacyToggleCard } from './PrivacyToggleCard';

type LeaderboardListHeaderProps = {
  isPublic: boolean;
  onToggle: (value: boolean) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
};

function LeaderboardListHeaderComponent({
  isPublic,
  onToggle,
  searchValue,
  onSearchChange,
  onClearSearch,
}: LeaderboardListHeaderProps) {
  return (
    <View style={styles.container}>
      <PrivacyToggleCard isPublic={isPublic} onToggle={onToggle} />
      <LeaderboardSearchBar
        value={searchValue}
        onChangeText={onSearchChange}
        onClear={onClearSearch}
      />
      <LeaderboardTitle />
    </View>
  );
}

export const LeaderboardListHeader = memo(LeaderboardListHeaderComponent);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});
