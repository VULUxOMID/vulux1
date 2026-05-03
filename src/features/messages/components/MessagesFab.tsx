import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../theme';
import { AppText } from '../../../components';

type MessagesFabProps = {
  onPress?: () => void;
};

function MessagesFabComponent({ onPress }: MessagesFabProps) {
  return (
    <Pressable style={styles.fab} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons
          name="people"
          size={20}
          color={colors.badgeNotificationText}
        />
      </View>
      <AppText style={styles.label}>New Group</AppText>
    </Pressable>
  );
}

export const MessagesFab = memo(MessagesFabComponent);

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: spacing.screenBottom + spacing.xs,
    left: spacing.lg,
    minWidth: 148,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: colors.textOnLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textOnLight,
    fontWeight: '700',
  },
});
