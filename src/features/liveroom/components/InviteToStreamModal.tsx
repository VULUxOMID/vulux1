import React from 'react';
import { View, StyleSheet, Modal, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LiveUser } from '../types';
import { hapticTap } from '../../../utils/haptics';

type InviteToStreamModalProps = {
  visible: boolean;
  onClose: () => void;
  user: LiveUser | null;
  onInvite: () => void;
  onCancel: () => void;
};

export function InviteToStreamModal({
  visible,
  onClose,
  user,
  onInvite,
  onCancel,
}: InviteToStreamModalProps) {
  if (!user) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            {user.avatarUrl?.trim() ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={22} color={colors.textMuted} />
              </View>
            )}
            <AppText variant="h3" style={styles.title}>Invite to stream</AppText>
            <AppText style={styles.subtitle}>
              Invite {user.name} to join as a co-host
            </AppText>
          </View>

          <Pressable 
            style={styles.optionButton}
            onPress={() => {
              hapticTap();
              onInvite();
            }}
          >
            <View style={[styles.optionIcon, styles.optionIconInvite]}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </View>
            <AppText style={styles.optionText}>Invite to stream</AppText>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          {/* Cancel */}
          <Pressable 
            style={styles.cancelButton}
            onPress={() => {
              hapticTap();
              onCancel();
            }}
          >
            <AppText style={styles.cancelText}>Cancel</AppText>
          </Pressable>
        </View>
      </View>
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
    maxWidth: 340,
    overflow: 'hidden',
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.accentPrimary,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 20,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },

  // Options
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    gap: spacing.md,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconInvite: {
    backgroundColor: colors.accentPrimary,
  },
  optionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Cancel
  cancelButton: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
});
