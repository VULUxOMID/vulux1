import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components';
import { colors, spacing } from '../../theme';

type ProfileHeaderProps = {
  onSettingsPress?: () => void;
};

export function ProfileHeader({ onSettingsPress }: ProfileHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Spacer for layout balance */}
      <View style={styles.spacer} />

      <AppText variant="h3" style={styles.title}>Profile</AppText>

      <Pressable onPress={onSettingsPress} style={styles.settingsButton}>
        <Ionicons name="settings-outline" size={26} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  spacer: {
    width: spacing.xxxl,
    height: spacing.xxxl,
  },
  title: {
    color: colors.textPrimary,
  },
  settingsButton: {
    width: spacing.xxxl,
    height: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
