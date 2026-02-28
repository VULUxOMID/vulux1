import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppScreen, AppText } from '../../src/components';
import { colors, spacing } from '../../src/theme';

export default function ClashOfDroneHoldScreen() {
  return (
    <AppScreen>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="hardware-chip-outline" size={34} color={colors.textPrimary} />
        </View>
        <AppText style={styles.title}>Clash of Drone</AppText>
        <AppText style={styles.subtitle}>This mode is on hold while we design the full game loop.</AppText>
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>Coming Soon</AppText>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  badge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
