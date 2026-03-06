import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText, AppTextInput } from '../../components';
import { colors, radius, spacing } from '../../theme';

export const DEFAULT_REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Hate speech',
  'Sexual content',
  'Scam / fraud',
  'Impersonation',
  'Other',
] as const;

type ReportComposerModalProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  submitLabel?: string;
  loading?: boolean;
  reasons?: readonly string[];
  initialReason?: string | null;
  initialDetails?: string;
  onClose: () => void;
  onSubmit: (input: { reason: string; details: string }) => Promise<void> | void;
};

export function ReportComposerModal({
  visible,
  title,
  subtitle,
  submitLabel = 'Submit report',
  loading = false,
  reasons = DEFAULT_REPORT_REASONS,
  initialReason = null,
  initialDetails = '',
  onClose,
  onSubmit,
}: ReportComposerModalProps) {
  const [reason, setReason] = useState<string | null>(initialReason);
  const [details, setDetails] = useState(initialDetails);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    setReason(initialReason);
    setDetails(initialDetails);
    setErrorMessage('');
  }, [initialDetails, initialReason, visible]);

  const canSubmit = useMemo(() => Boolean(reason) && !loading, [loading, reason]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText style={styles.title}>{title}</AppText>
              <AppText style={styles.subtitle}>{subtitle}</AppText>
            </View>
            <Pressable hitSlop={8} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.reasonWrap}>
              {reasons.map((candidateReason) => {
                const selected = reason === candidateReason;
                return (
                  <Pressable
                    key={candidateReason}
                    onPress={() => {
                      setReason(candidateReason);
                      setErrorMessage('');
                    }}
                    style={[styles.reasonChip, selected ? styles.reasonChipSelected : null]}
                  >
                    <AppText style={[styles.reasonText, selected ? styles.reasonTextSelected : null]}>
                      {candidateReason}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText style={styles.sectionLabel}>Details</AppText>
            <AppTextInput
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={styles.textArea}
              placeholder="Add any context that helps moderation review this quickly."
              value={details}
              onChangeText={(value) => {
                setDetails(value);
                if (errorMessage) {
                  setErrorMessage('');
                }
              }}
            />

            {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          </ScrollView>

          <Pressable
            disabled={!canSubmit}
            onPress={() => {
              if (!reason) {
                setErrorMessage('Select a reason before sending the report.');
                return;
              }
              void onSubmit({ reason, details });
            }}
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit ? styles.submitButtonDisabled : null,
              pressed && canSubmit ? styles.submitButtonPressed : null,
            ]}
          >
            <AppText style={styles.submitText}>{loading ? 'Submitting…' : submitLabel}</AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  reasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reasonChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  reasonChipSelected: {
    backgroundColor: colors.accentPrimarySubtle,
    borderColor: colors.accentPrimary,
  },
  reasonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  reasonTextSelected: {
    color: colors.accentPrimary,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  textArea: {
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.accentDanger,
    fontSize: 13,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonPressed: {
    opacity: 0.82,
  },
  submitText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
