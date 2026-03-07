import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppButton, AppText } from '../../components';
import { toast } from '../../components/Toast';
import { colors, radius, spacing } from '../../theme';
import type { WithdrawalRequest } from '../../context';
import { DEFAULT_MIN_WITHDRAWAL_GEMS } from './withdrawalEligibility';

type WithdrawalMethod = 'PayPal' | 'Bank';

type WithdrawalModalProps = {
  visible: boolean;
  gems: number;
  canRequestWithdrawal: boolean;
  disabledReason?: string | null;
  onClose: () => void;
  onSubmit: (
    amountGems: number,
    details: WithdrawalRequest['details'],
    method: WithdrawalMethod
  ) => boolean;
  minWithdrawalGems?: number;
};

const STEP_COUNT = 2;

export const WithdrawalModal = React.memo(function WithdrawalModal({
  visible,
  gems,
  canRequestWithdrawal,
  disabledReason,
  onClose,
  onSubmit,
  minWithdrawalGems = DEFAULT_MIN_WITHDRAWAL_GEMS,
}: WithdrawalModalProps) {
  const [withdrawStep, setWithdrawStep] = useState(1);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawalMethod>('PayPal');
  const [saveDetails, setSaveDetails] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsedAmount = useMemo(() => Number.parseInt(withdrawAmount, 10), [withdrawAmount]);
  const hasValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;
  const payoutValue = hasValidAmount ? (parsedAmount * 0.01).toFixed(2) : '0.00';

  const resetForm = useCallback(() => {
    setWithdrawStep(1);
    setWithdrawAmount('');
    setFullName('');
    setEmail('');
    setPhoneNumber('');
    setWithdrawMethod('PayPal');
    setSaveDetails(true);
    setIsSubmitting(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [resetForm, visible]);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handlePercentageSelect = useCallback(
    (percent: number) => {
      const amount = Math.floor(gems * (percent / 100));
      setWithdrawAmount(amount.toString());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [gems]
  );

  const handleContinue = useCallback(() => {
    if (!canRequestWithdrawal) {
      toast.info(disabledReason ?? 'Withdrawal is unavailable right now.');
      return;
    }
    if (!hasValidAmount) {
      toast.warning('Please enter a valid amount of gems.');
      return;
    }
    if (parsedAmount < minWithdrawalGems) {
      toast.warning(`You must withdraw at least ${minWithdrawalGems} Gems.`);
      return;
    }
    if (parsedAmount > gems) {
      toast.warning('You do not have enough gems.');
      return;
    }

    setWithdrawStep(2);
  }, [canRequestWithdrawal, disabledReason, gems, hasValidAmount, minWithdrawalGems, parsedAmount]);

  const handleSubmit = useCallback(() => {
    if (!canRequestWithdrawal) {
      toast.info(disabledReason ?? 'Withdrawal is unavailable right now.');
      return;
    }
    if (!hasValidAmount) {
      toast.warning('Please enter a valid amount of gems.');
      return;
    }
    if (parsedAmount > gems) {
      toast.warning('You do not have enough gems.');
      return;
    }
    if (!fullName || !email || !phoneNumber) {
      toast.warning('Please fill out all fields.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    submitTimeoutRef.current = setTimeout(() => {
      const success = onSubmit(
        parsedAmount,
        { fullName, email, phoneNumber },
        withdrawMethod
      );
      setIsSubmitting(false);

      if (success) {
        handleClose();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.success('Withdrawal submitted! Funds will arrive in 2-3 business days.');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error('Something went wrong. Please try again.');
      }
    }, 2000);
  }, [
    email,
    fullName,
    gems,
    handleClose,
    hasValidAmount,
    canRequestWithdrawal,
    disabledReason,
    onSubmit,
    parsedAmount,
    phoneNumber,
    withdrawMethod,
  ]);

  const handleMethodSelect = useCallback((method: WithdrawalMethod) => {
    setWithdrawMethod(method);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleSaveDetails = useCallback(() => {
    setSaveDetails((prev) => !prev);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <View style={styles.modalHeader}>
          <View style={styles.headerContent}>
            <AppText variant="h3">Withdraw Gems</AppText>
            <View style={styles.stepProgressContainer}>
              <View
                style={[
                  styles.stepProgressBar,
                  { width: withdrawStep === 1 ? '50%' : '100%' },
                ]}
              />
            </View>
            <AppText variant="tiny" secondary>
              Step {withdrawStep} of {STEP_COUNT}
            </AppText>
          </View>
          <Pressable onPress={handleClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={spacing.xl} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
          {withdrawStep === 1 ? (
            <View style={styles.stepContainer}>
              {disabledReason ? (
                <View style={styles.disabledNotice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={spacing.lg}
                    color={colors.accentWarning}
                  />
                  <AppText variant="tiny" style={styles.disabledNoticeText}>
                    {disabledReason}
                  </AppText>
                </View>
              ) : null}
              <AppText secondary style={styles.stepDescription}>
                Enter the amount of gems you want to convert to real money.
              </AppText>

              <View style={styles.formGroup}>
                <View style={styles.labelRow}>
                  <AppText style={styles.label}>Withdraw Amount</AppText>
                  <AppText variant="tiny" style={styles.balanceText}>
                    Balance: {gems}
                  </AppText>
                </View>

                <View style={styles.amountInputContainer}>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0"
                    placeholderTextColor={colors.inputPlaceholder}
                    keyboardType="numeric"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    editable={canRequestWithdrawal}
                  />
                  <View style={styles.amountCurrency}>
                    <Ionicons name="prism" size={spacing.lg} color={colors.accentPremium} />
                    <AppText style={styles.amountCurrencyText}>GEMS</AppText>
                  </View>
                </View>

                <View style={styles.percentageRow}>
                  {[25, 50, 75, 100].map((pct) => (
                    <Pressable
                      key={pct}
                      style={styles.pctPill}
                      disabled={!canRequestWithdrawal}
                      onPress={() => handlePercentageSelect(pct)}
                    >
                      <AppText variant="tiny" style={styles.pctText}>
                        {pct === 100 ? 'MAX' : `${pct}%`}
                      </AppText>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.minRequirementRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={spacing.md}
                    color={colors.textMuted}
                  />
                  <AppText variant="tiny" secondary>
                    Minimum withdrawal: {minWithdrawalGems} Gems ($5.00)
                  </AppText>
                </View>

                {hasValidAmount ? (
                  <View style={styles.valueCard}>
                    <AppText variant="small" secondary>
                      You will receive approximately
                    </AppText>
                    <AppText variant="h1" style={styles.valueAmount}>
                      ${payoutValue}
                    </AppText>
                  </View>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.label}>Payment Method</AppText>
                <View style={styles.methodGrid}>
                  <Pressable
                    style={[
                      styles.methodCard,
                      withdrawMethod === 'PayPal' && styles.methodCardActive,
                    ]}
                    disabled={!canRequestWithdrawal}
                    onPress={() => handleMethodSelect('PayPal')}
                  >
                    <View style={[styles.methodIcon, styles.methodIconPayPal]}>
                      <Ionicons name="logo-paypal" size={spacing.xl} color={colors.textPrimary} />
                    </View>
                    <AppText variant="small" style={styles.methodName}>
                      PayPal
                    </AppText>
                    {withdrawMethod === 'PayPal' ? (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark-circle" size={spacing.lg} color={colors.accentSuccess} />
                      </View>
                    ) : null}
                  </Pressable>

                  <Pressable
                    style={[
                      styles.methodCard,
                      withdrawMethod === 'Bank' && styles.methodCardActive,
                    ]}
                    disabled={!canRequestWithdrawal}
                    onPress={() => handleMethodSelect('Bank')}
                  >
                    <View style={[styles.methodIcon, styles.methodIconBank]}>
                      <Ionicons name="business" size={spacing.xl} color={colors.textPrimary} />
                    </View>
                    <AppText variant="small" style={styles.methodName}>
                      Bank Transfer
                    </AppText>
                    {withdrawMethod === 'Bank' ? (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark-circle" size={spacing.lg} color={colors.accentSuccess} />
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              </View>

              <AppButton
                title="Continue"
                variant="primary"
                disabled={
                  !canRequestWithdrawal ||
                  !hasValidAmount ||
                  parsedAmount < minWithdrawalGems ||
                  parsedAmount > gems
                }
                onPress={handleContinue}
                style={styles.continueButton}
              />
            </View>
          ) : (
            <View style={styles.stepContainer}>
              {disabledReason ? (
                <View style={styles.disabledNotice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={spacing.lg}
                    color={colors.accentWarning}
                  />
                  <AppText variant="tiny" style={styles.disabledNoticeText}>
                    {disabledReason}
                  </AppText>
                </View>
              ) : null}
              <AppText secondary style={styles.stepDescription}>
                Where should we send your {withdrawMethod} payment?
              </AppText>

              <View style={styles.formGroup}>
                <AppText style={styles.label}>Full Name</AppText>
                <TextInput
                  style={styles.input}
                  placeholder="Legal name on account"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={fullName}
                  onChangeText={setFullName}
                  editable={canRequestWithdrawal}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.label}>
                  {withdrawMethod === 'PayPal' ? 'PayPal Email' : 'Account Email'}
                </AppText>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.inputPlaceholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  editable={canRequestWithdrawal}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.label}>Contact Phone</AppText>
                <TextInput
                  style={styles.input}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={colors.inputPlaceholder}
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  editable={canRequestWithdrawal}
                />
              </View>

              <Pressable
                style={styles.saveDetailsRow}
                onPress={toggleSaveDetails}
                disabled={!canRequestWithdrawal}
              >
                <View style={[styles.checkbox, saveDetails && styles.checkboxActive]}>
                  {saveDetails ? (
                    <Ionicons name="checkmark" size={spacing.md} color={colors.textPrimary} />
                  ) : null}
                </View>
                <AppText variant="small" secondary>
                  Save payment details for next time
                </AppText>
              </Pressable>

              <View style={styles.summaryCard}>
                <AppText variant="tiny" secondary style={styles.summaryTitle}>
                  Order Summary
                </AppText>
                <View style={styles.summaryRow}>
                  <AppText variant="small">Withdrawal</AppText>
                  <AppText variant="small" style={styles.summaryValue}>
                    {withdrawAmount || '--'} Gems
                  </AppText>
                </View>
                <View style={styles.summaryRow}>
                  <AppText variant="small">Payment Method</AppText>
                  <AppText variant="small" style={styles.summaryValue}>
                    {withdrawMethod}
                  </AppText>
                </View>
                <View style={styles.summaryRow}>
                  <AppText variant="small">Processing Time</AppText>
                  <AppText variant="small" style={styles.summaryValue}>
                    2-3 Business Days
                  </AppText>
                </View>
                <View style={[styles.summaryRow, styles.summaryRowEmphasis]}>
                  <AppText style={styles.summaryTotalLabel}>Total Payout</AppText>
                  <AppText style={styles.summaryTotalValue}>${payoutValue}</AppText>
                </View>
              </View>

              <View style={styles.infoNote}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={spacing.lg}
                  color={colors.textMuted}
                />
                <AppText variant="tiny" secondary style={styles.infoNoteText}>
                  Your transaction is encrypted and secure. By submitting, you agree to our withdrawal
                  terms.
                </AppText>
              </View>

              <View style={styles.actionsRow}>
                <AppButton
                  title="Back"
                  variant="outline"
                  onPress={() => setWithdrawStep(1)}
                  style={styles.backButton}
                />
                <AppButton
                  title="Submit Request"
                  variant="primary"
                  disabled={
                    !canRequestWithdrawal ||
                    !fullName ||
                    !email ||
                    !phoneNumber ||
                    isSubmitting
                  }
                  loading={isSubmitting}
                  onPress={handleSubmit}
                  style={styles.submitButton}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerContent: {
    flex: 1,
  },
  modalCloseButton: {
    padding: spacing.xs,
    marginTop: -spacing.xs,
  },
  stepProgressContainer: {
    height: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xs,
    marginVertical: spacing.sm,
    width: '100%',
    overflow: 'hidden',
  },
  stepProgressBar: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.xs,
  },
  modalContent: {
    padding: spacing.lg,
  },
  disabledNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.accentWarning}40`,
    backgroundColor: `${colors.accentWarning}14`,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  disabledNoticeText: {
    flex: 1,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  stepContainer: {
    gap: spacing.md,
  },
  stepDescription: {
    marginBottom: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    marginBottom: spacing.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  balanceText: {
    color: colors.accentPremium,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: spacing.xxl + spacing.xl + spacing.xs,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  amountCurrency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    opacity: 0.8,
  },
  amountCurrencyText: {
    fontWeight: '700',
  },
  percentageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  pctPill: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pctText: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  minRequirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + spacing.xxs,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.xs,
  },
  valueCard: {
    backgroundColor: `${colors.accentSuccess}0D`,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.accentSuccess}33`,
  },
  valueAmount: {
    color: colors.accentSuccess,
  },
  methodGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  methodCard: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  methodCardActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surface,
  },
  methodIcon: {
    width: spacing.xxl + spacing.lg,
    height: spacing.xxl + spacing.lg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  methodIconPayPal: {
    backgroundColor: colors.accentPayPal,
  },
  methodIconBank: {
    backgroundColor: colors.accentPrimary,
  },
  methodName: {
    fontWeight: '600',
  },
  checkBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  continueButton: {
    marginTop: spacing.xl,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  saveDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: spacing.xl + spacing.xs,
    height: spacing.xl + spacing.xs,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxActive: {
    backgroundColor: colors.accentSuccess,
    borderColor: colors.accentSuccess,
  },
  summaryCard: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  summaryTitle: {
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xxs,
  },
  summaryRowEmphasis: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  summaryValue: {
    fontWeight: '700',
  },
  summaryTotalLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
  summaryTotalValue: {
    fontWeight: '700',
    fontSize: 18,
    color: colors.accentSuccess,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  infoNoteText: {
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  backButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
  },
});
