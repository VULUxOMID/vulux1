import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { adminTokens, AdminTone } from '../ui/adminTokens';
import { AdminButton } from '../ui/AdminLayout';

export type ConfirmActionPayload = {
  reason: string;
  confirmationText: string;
  secondApprovalConfirmed: boolean;
};

type ConfirmActionModalProps = {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: Exclude<AdminTone, 'neutral'>;
  requireReason?: boolean;
  requireTypeToConfirmText?: string;
  requireSecondApproval?: boolean;
  secondApprovalLabel?: string;
  secondApprovalDescription?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (payload: ConfirmActionPayload) => void;
};

export function ConfirmActionModal({
  visible,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  requireReason = true,
  requireTypeToConfirmText,
  requireSecondApproval = false,
  secondApprovalLabel = 'Secondary approval captured',
  secondApprovalDescription,
  loading,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [secondApprovalConfirmed, setSecondApprovalConfirmed] = useState(false);

  useEffect(() => {
    if (!visible) {
      setReason('');
      setConfirmText('');
      setSecondApprovalConfirmed(false);
    }
  }, [visible]);

  const canConfirm = useMemo(() => {
    const reasonValid = !requireReason || reason.trim().length > 0;
    const typeToConfirmValid = !requireTypeToConfirmText || confirmText.trim() === requireTypeToConfirmText;
    const secondApprovalValid = !requireSecondApproval || secondApprovalConfirmed;
    return reasonValid && typeToConfirmValid && secondApprovalValid && !loading;
  }, [
    confirmText,
    loading,
    reason,
    requireReason,
    requireSecondApproval,
    requireTypeToConfirmText,
    secondApprovalConfirmed,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? () => undefined : onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {requireReason ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Reason</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Explain why this action is needed"
                placeholderTextColor={adminTokens.colors.textMuted}
                style={[styles.input, styles.textArea]}
                multiline
              />
            </View>
          ) : null}

          {requireTypeToConfirmText ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Type to confirm: {requireTypeToConfirmText}</Text>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={requireTypeToConfirmText}
                placeholderTextColor={adminTokens.colors.textMuted}
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          ) : null}

          {requireSecondApproval ? (
            <Pressable
              onPress={() => setSecondApprovalConfirmed((prev) => !prev)}
              disabled={loading}
              style={[
                styles.approvalRow,
                secondApprovalConfirmed ? styles.approvalRowActive : null,
                loading ? styles.disabledRow : null,
              ]}
            >
              <Ionicons
                name={secondApprovalConfirmed ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={
                  secondApprovalConfirmed ? adminTokens.colors.success : adminTokens.colors.textSecondary
                }
              />
              <View style={styles.approvalTextWrap}>
                <Text style={styles.approvalTitle}>{secondApprovalLabel}</Text>
                {secondApprovalDescription ? (
                  <Text style={styles.approvalDescription}>{secondApprovalDescription}</Text>
                ) : null}
              </View>
            </Pressable>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable onPress={onCancel} disabled={loading} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <AdminButton
              label={confirmLabel}
              tone={tone}
              onPress={() =>
                onConfirm({
                  reason: reason.trim(),
                  confirmationText: confirmText.trim(),
                  secondApprovalConfirmed,
                })
              }
              disabled={!canConfirm}
              loading={loading}
            />
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
    padding: adminTokens.spacing.pageX,
  },
  modalCard: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.card,
    backgroundColor: adminTokens.colors.surface,
    padding: adminTokens.spacing.card,
    gap: adminTokens.spacing.gapMd,
  },
  title: {
    ...adminTokens.typography.cardTitle,
    color: adminTokens.colors.textPrimary,
  },
  description: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
  },
  inputGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: adminTokens.spacing.gapSm,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  approvalRowActive: {
    borderColor: adminTokens.colors.success,
  },
  disabledRow: {
    opacity: 0.6,
  },
  approvalTextWrap: {
    flex: 1,
    gap: 2,
  },
  approvalTitle: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textPrimary,
  },
  approvalDescription: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  label: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  input: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
    color: adminTokens.colors.textPrimary,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
    ...adminTokens.typography.body,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
  },
  cancelButton: {
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
  },
  cancelText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
});
