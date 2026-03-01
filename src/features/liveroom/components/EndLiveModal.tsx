import React from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';

type EndLiveModalProps = {
  visible: boolean;
  onClose: () => void;
  onEndLive: () => void;
  isHost: boolean;
  confirmText?: string;
  title?: string;
  subtitle?: string;
};

export function EndLiveModal({
  visible,
  onClose,
  onEndLive,
  isHost,
  confirmText,
  title,
  subtitle,
}: EndLiveModalProps) {
  const handleEndLive = () => {
    hapticTap();
    onEndLive();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="exit-outline" size={32} color={colors.accentDanger} />
            </View>
          </View>

          {/* Title & Description */}
          <AppText variant="h3" style={styles.title}>
            {title || (isHost ? 'End Live?' : 'Leave Live?')}
          </AppText>
          <AppText style={styles.subtitle}>
            {subtitle ||
              (isHost
                ? 'Ending now will stop the live for everyone.'
                : 'You will leave this live. The stream keeps running for others.')}
          </AppText>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                hapticTap();
                onClose();
              }}
            >
              <AppText style={styles.cancelText}>Cancel</AppText>
            </Pressable>

            <Pressable
              style={styles.endButton}
              onPress={handleEndLive}
            >
              <AppText style={styles.endText}>
                {confirmText || (isHost ? 'End Live' : 'Leave Live')}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 300,
    overflow: 'hidden',
  },

  // Icon
  iconContainer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Text
  title: {
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  endButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  endText: {
    color: colors.accentDanger,
    fontSize: 16,
    fontWeight: '600',
  },
});
