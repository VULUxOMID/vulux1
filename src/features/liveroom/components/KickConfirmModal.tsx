import React from 'react';
import { View, StyleSheet, Modal, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LiveUser } from '../types';
import { hapticTap } from '../../../utils/haptics';

type KickConfirmModalProps = {
  visible: boolean;
  onClose: () => void;
  user: LiveUser | null;
  onConfirm: () => void;
};

export function KickConfirmModal({
  visible,
  onClose,
  user,
  onConfirm,
}: KickConfirmModalProps) {
  if (!user) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          {/* User info */}
          <View style={styles.header}>
            {user.avatarUrl?.trim() ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={22} color={colors.textMuted} />
              </View>
            )}
            <AppText variant="h3" style={styles.title}>
              Kick {user.name} out?
            </AppText>
            <AppText style={styles.subtitle}>
              They will be removed from streaming but can still watch
            </AppText>
          </View>

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
              style={styles.kickButton}
              onPress={() => {
                hapticTap();
                onConfirm();
              }}
            >
              <AppText style={styles.kickText}>Kick out</AppText>
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

  // Header
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: spacing.md,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
  kickButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  kickText: {
    color: colors.accentDanger,
    fontSize: 16,
    fontWeight: '600',
  },
});

