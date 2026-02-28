import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TextInput, View, Pressable } from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';

type HomeSearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export const HomeSearchBar = React.memo(function HomeSearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
}: HomeSearchBarProps) {
  return (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    height: 36,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
    paddingVertical: 0,
  },
});
