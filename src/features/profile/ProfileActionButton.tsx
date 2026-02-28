import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';

type ProfileActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  iconColor?: string;
  onPress?: () => void;
  showChevron?: boolean;
  badge?: string;
};

export function ProfileActionButton({
  icon,
  title,
  subtitle,
  iconColor = colors.textSecondary,
  onPress,
  showChevron = true,
  badge,
}: ProfileActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>

      <View style={styles.content}>
        <AppText variant="bodyBold">{title}</AppText>
        {subtitle && (
          <AppText variant="small" secondary>{subtitle}</AppText>
        )}
      </View>

      {badge && (
        <View style={styles.badge}>
          <AppText variant="tinyBold">{badge}</AppText>
        </View>
      )}

      {showChevron && (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.8,
    backgroundColor: colors.surfaceAlt,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  badge: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
});
