import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../../components';
import { colors, radius, spacing, typography } from '../../../theme';

type MessagesSearchBarProps = {
  onPress: () => void;
};

function MessagesSearchBarComponent({
  onPress,
}: MessagesSearchBarProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Find friends to add"
      onPress={onPress}
      style={({ pressed }) => [styles.searchBarContainer, pressed && styles.searchBarPressed]}
    >
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <AppText style={styles.searchInput}>Search friends to add</AppText>
      </View>
    </Pressable>
  );
}

export const MessagesSearchBar = memo(MessagesSearchBarComponent);

const styles = StyleSheet.create({
  searchBarContainer: {
    justifyContent: 'center',
    marginVertical: spacing.xs,
  },
  searchBarPressed: {
    opacity: 0.85,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    height: 36,
  },
  searchInput: {
    flex: 1,
    color: colors.textMuted,
    ...typography.small,
    paddingVertical: 0,
  },
});
