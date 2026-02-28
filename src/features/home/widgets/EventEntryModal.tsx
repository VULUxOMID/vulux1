import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Modal, Animated, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppText, AppButton, CashIcon } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatCurrency(value: number): string {
  if (value <= 0) return '$0';
  return `$${Math.round(value).toLocaleString()}`;
}

interface EventEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => boolean | Promise<boolean>;
  entryCost: number;
  currentBalance: number;
  prizePool: number;
  drawMinutes: number;
}

export function EventEntryModal({
  visible,
  onClose,
  onConfirm,
  entryCost,
  currentBalance,
  prizePool,
  drawMinutes,
}: EventEntryModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setShowSuccess(false);
      setConfirming(false);
      setConfirmError(null);
      // Reset animations
      slideAnim.setValue(SCREEN_HEIGHT);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);

      // Spring up
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          stiffness: 100,
          damping: 15,
          mass: 1.2, // User preference for pendulum feel
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 120,
          damping: 14,
          mass: 1,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [visible, slideAnim, fadeAnim, scaleAnim]);

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const handleConfirm = async () => {
    if (confirming || showSuccess) return;

    setConfirmError(null);
    setConfirming(true);
    try {
      const didConfirm = await onConfirm();
      if (!didConfirm) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setConfirmError('Insufficient funds. Top up your wallet to enter this event.');
        setConfirming(false);
        return;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);
      timeoutRef.current = setTimeout(() => {
        setConfirming(false);
        handleClose();
      }, 1500);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setConfirmError('Unable to complete entry right now. Please try again.');
      setConfirming(false);
    }
  };

  const hasFunds = currentBalance >= entryCost;
  const remainingBalance = currentBalance - entryCost;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={handleClose}
      animationType="none"
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Animated.View style={[styles.backdropFill, { opacity: fadeAnim }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheetContainer,
            { transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }
          ]}
        >
          <LinearGradient
            colors={[colors.surface, colors.surfaceAlt]}
            style={styles.sheetContent}
          >
            {showSuccess ? (
              <View style={styles.successContainer}>
                <View style={styles.iconCircle}>
                  <Ionicons name="checkmark" size={48} color={colors.accentSuccess} />
                </View>
                <AppText variant="h1" style={styles.successTitle}>Entry Confirmed!</AppText>
                <AppText variant="body" muted style={styles.successText}>
                  {drawMinutes > 0
                    ? `Good luck! Results in ${drawMinutes} ${drawMinutes === 1 ? 'minute' : 'minutes'}.`
                    : 'Good luck! Results in the next draw.'}
                </AppText>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <AppText variant="h1">Confirm Entry</AppText>
                  <Pressable onPress={handleClose} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.ticketPreview}>
                  <View style={styles.ticket}>
                    <View style={styles.ticketLeft}>
                      <Ionicons name="ticket-outline" size={32} color={colors.textPrimary} />
                    </View>
                    <View style={styles.ticketRight}>
                      <AppText variant="body" style={styles.boldText}>Premium Raffle Entry</AppText>
                      <AppText variant="small" muted>
                        {prizePool > 0 ? `Win up to ${formatCurrency(prizePool)}` : 'Prize announced soon'}
                      </AppText>
                    </View>
                    <View style={styles.ticketPrice}>
                      <AppText variant="h1" style={{ color: colors.accentSuccess }}>${entryCost}</AppText>
                    </View>
                  </View>
                </View>

                <View style={styles.balanceRow}>
                  <AppText variant="body" muted>Wallet Balance</AppText>
                  <View style={styles.valueRow}>
                    <CashIcon size={16} color={colors.accentSuccess} />
                    <AppText variant="body" style={styles.boldText}>${currentBalance.toLocaleString()}</AppText>
                  </View>
                </View>

                <View style={[styles.balanceRow, styles.totalRow]}>
                  <AppText variant="body" style={styles.boldText}>Balance After</AppText>
                  <View style={styles.valueRow}>
                    <AppText
                      variant="body"
                      style={[
                        styles.boldText,
                        { color: hasFunds ? colors.textPrimary : colors.accentDanger }
                      ]}
                    >
                      ${remainingBalance.toLocaleString()}
                    </AppText>
                  </View>
                </View>

                <View style={styles.footer}>
                  <AppButton
                    title={hasFunds ? (confirming ? 'Processing...' : 'Confirm Entry') : 'Insufficient Funds'}
                    onPress={handleConfirm}
                    disabled={!hasFunds || confirming || showSuccess}
                    variant={hasFunds ? 'primary' : 'outline'}
                    style={[styles.confirmButton, { width: '100%' }]}
                  />
                  {confirmError ? (
                    <AppText variant="small" style={styles.errorText}>
                      {confirmError}
                    </AppText>
                  ) : null}
                  {!hasFunds && !confirmError && (
                    <AppText variant="small" style={styles.errorText}>
                      Top up your wallet to enter this event.
                    </AppText>
                  )}
                </View>
              </>
            )}
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheetContainer: {
    width: '100%',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  sheetContent: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20, // Extra padding for safe area
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  closeButton: {
    padding: 4,
  },
  ticketPreview: {
    marginBottom: spacing.xl,
  },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  ticketLeft: {
    paddingRight: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
    marginRight: spacing.md,
  },
  ticketRight: {
    flex: 1,
  },
  ticketPrice: {
    marginLeft: spacing.md,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  totalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginBottom: spacing.xl,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footer: {
    gap: spacing.sm,
  },
  confirmButton: {
    height: 56,
  },
  errorText: {
    color: colors.accentDanger,
    textAlign: 'center',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSuccess + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.accentSuccess,
  },
  successTitle: {
    color: colors.accentSuccess,
    marginBottom: spacing.xs,
  },
  successText: {
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
});
