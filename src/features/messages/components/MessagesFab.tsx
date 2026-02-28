import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

type MessagesFabProps = {
  onPress?: () => void;
};

function MessagesFabComponent({ onPress }: MessagesFabProps) {
  return (
    <Pressable style={styles.fab} onPress={onPress}>
      <Ionicons
        name="people"
        size={24}
        color={colors.badgeNotificationText}
      />
    </Pressable>
  );
}

export const MessagesFab = memo(MessagesFabComponent);

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: spacing.screenBottom,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.textOnLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});
