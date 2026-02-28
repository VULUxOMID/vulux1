import React, { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../../../theme';

type LeaderboardSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
};

function LeaderboardSearchBarComponent({
  value,
  onChangeText,
  onClear,
}: LeaderboardSearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={20} color={colors.textMuted} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder="Search user..."
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 ? (
        <Pressable onPress={onClear}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const LeaderboardSearchBar = memo(LeaderboardSearchBarComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    height: '100%',
    ...typography.small,
  },
});
