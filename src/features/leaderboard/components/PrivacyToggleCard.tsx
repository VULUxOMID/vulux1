import React, { memo, useMemo } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type PrivacyToggleCardProps = {
  isPublic: boolean;
  onToggle: (value: boolean) => void;
};

function PrivacyToggleCardComponent({ isPublic, onToggle }: PrivacyToggleCardProps) {
  const copy = useMemo(
    () => ({
      iconName: (isPublic ? 'eye' : 'eye-off') as keyof typeof Ionicons.glyphMap,
      iconColor: isPublic ? colors.textPrimary : colors.textMuted,
      title: isPublic ? 'Public Profile' : 'Private Mode',
      subtitle: isPublic
        ? 'You are visible on the leaderboard'
        : 'You are hidden from the leaderboard',
    }),
    [isPublic],
  );

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <View style={styles.iconCircle}>
          <Ionicons name={copy.iconName} size={20} color={copy.iconColor} />
        </View>
        <View style={styles.textContainer}>
          <AppText variant="label">{copy.title}</AppText>
          <AppText variant="tiny" secondary style={styles.subtitle}>
            {copy.subtitle}
          </AppText>
        </View>
      </View>
      <Switch
        value={isPublic}
        onValueChange={onToggle}
        trackColor={{ false: colors.surfaceAlt, true: colors.accentPrimary }}
        thumbColor={colors.badgeNotificationText}
        ios_backgroundColor={colors.surfaceAlt}
      />
    </View>
  );
}

export const PrivacyToggleCard = memo(PrivacyToggleCardComponent);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  subtitle: {
    marginTop: spacing.xxs,
  },
});
