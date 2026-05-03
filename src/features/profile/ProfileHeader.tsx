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
      <View style={styles.titleBlock}>
        <AppText variant="micro" style={styles.eyebrow}>Your space</AppText>
        <AppText variant="h2" style={styles.title}>Profile</AppText>
      </View>

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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  titleBlock: {
    gap: spacing.xxs,
  },
  title: {
    color: colors.textPrimary,
  },
  eyebrow: {
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
});
