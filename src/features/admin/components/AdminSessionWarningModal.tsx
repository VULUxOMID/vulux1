import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components/AppText';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { adminTokens } from '../ui/adminTokens';

export function AdminSessionWarningModal() {
  const {
    isAuthedForAdmin,
    isSessionWarningVisible,
    secondsRemaining,
    extendAdminSession,
    expireAdminSession,
  } = useAdminAuth();

  if (!isAuthedForAdmin) {
    return null;
  }

  return (
    <Modal
      visible={isSessionWarningVisible}
      transparent
      animationType="fade"
      onRequestClose={() => expireAdminSession('locked')}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="timer-outline" size={24} color={adminTokens.colors.warning} />
          </View>

          <AppText variant="h3" style={styles.title}>
            Admin session expiring
          </AppText>

          <AppText style={styles.body}>
            Admin unlock will be required in {Math.max(1, secondsRemaining ?? 0)} seconds if this
            session stays idle.
          </AppText>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={() => expireAdminSession('locked')}
            >
              <AppText style={styles.secondaryText}>Lock now</AppText>
            </Pressable>

            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={extendAdminSession}
            >
              <AppText style={styles.primaryText}>Extend session</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: adminTokens.colors.overlayScrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: adminTokens.spacing.pageX,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: adminTokens.colors.surface,
    borderRadius: adminTokens.radius.card,
    borderWidth: 1,
    borderColor: adminTokens.colors.border,
    padding: adminTokens.spacing.section,
    gap: adminTokens.spacing.gapLg,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: adminTokens.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTokens.colors.warningSubtle,
  },
  title: {
    color: adminTokens.colors.textPrimary,
  },
  body: {
    color: adminTokens.colors.textSecondary,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: adminTokens.spacing.gapMd,
  },
  button: {
    minHeight: 44,
    minWidth: 120,
    borderRadius: adminTokens.radius.button,
    paddingHorizontal: adminTokens.spacing.gapLg,
    paddingVertical: adminTokens.spacing.gapSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButton: {
    backgroundColor: adminTokens.colors.surfaceAlt,
    borderColor: adminTokens.colors.border,
  },
  secondaryText: {
    color: adminTokens.colors.textSecondary,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: adminTokens.colors.primary,
    borderColor: adminTokens.colors.primaryBorder,
  },
  primaryText: {
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
});
