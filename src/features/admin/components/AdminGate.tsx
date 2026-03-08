import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { adminTokens } from '../ui/adminTokens';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { auditLogger } from '../utils/auditLogger';
import { AdminSessionWarningModal } from './AdminSessionWarningModal';
import { getAdminGateCopy } from './adminGateMessaging';

interface AdminGateProps {
  children: React.ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  const router = useRouter();
  const {
    isAdmin,
    isAuthedForAdmin,
    setAuthedForAdmin,
    markAdminActivity,
    authChallengeReason,
  } = useAdminAuth();

  const challengeCopy = getAdminGateCopy(authChallengeReason);

  const handleUnlock = useCallback(() => {
    auditLogger.log({
      adminId: 'current-admin',
      actionType: 'ADMIN_SESSION_UNLOCK_SINGLE_FACTOR',
      targetType: 'system',
      targetId: 'admin-gate',
      reason:
        'Unlocked admin session using the signed-in admin role only. Real server-backed MFA is not configured.',
    });
    setAuthedForAdmin(true);
  }, [setAuthedForAdmin]);

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.unauthorizedContent}>
          <Ionicons name="shield-half" size={64} color={adminTokens.colors.danger} />
          <Text style={styles.title}>Access Denied</Text>
          <Text style={styles.subtitle}>You do not have administrative privileges.</Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace('/' as any)}>
            <Text style={styles.backBtnText}>Return to Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isAuthedForAdmin) {
    return (
      <View
        style={styles.authedContainer}
        onStartShouldSetResponderCapture={() => {
          markAdminActivity();
          return false;
        }}
      >
        {children}
        <AdminSessionWarningModal />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.authContent}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={32} color={adminTokens.colors.primary} />
        </View>
        <Text style={styles.title}>{challengeCopy.title}</Text>
        <Text style={styles.subtitle}>{challengeCopy.subtitle}</Text>

        <View style={styles.noticeCard}>
          <Ionicons name="alert-circle-outline" size={20} color={adminTokens.colors.warning} />
          <Text style={styles.noticeText}>{challengeCopy.securityNotice}</Text>
        </View>

        <Pressable style={styles.submitBtn} onPress={handleUnlock}>
          <Text style={styles.submitBtnText}>{challengeCopy.actionLabel}</Text>
        </Pressable>

        <Pressable onPress={() => router.replace('/' as any)} style={styles.cancelLink}>
          <Text style={styles.cancelText}>Return to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTokens.colors.pageBg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  authedContainer: {
    flex: 1,
  },
  unauthorizedContent: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  authContent: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: adminTokens.colors.border,
    backgroundColor: adminTokens.colors.surface,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTokens.colors.primarySubtle,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: adminTokens.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: adminTokens.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  noticeCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTokens.colors.warningBorder,
    backgroundColor: adminTokens.colors.warningSubtle,
    marginBottom: 20,
  },
  noticeText: {
    flex: 1,
    color: adminTokens.colors.textPrimary,
    lineHeight: 20,
    fontSize: 14,
  },
  submitBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: adminTokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  submitBtnText: {
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  cancelLink: {
    paddingVertical: 8,
  },
  cancelText: {
    color: adminTokens.colors.textSecondary,
    fontWeight: '600',
  },
  backBtn: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTokens.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: adminTokens.colors.border,
  },
  backBtnText: {
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
});
