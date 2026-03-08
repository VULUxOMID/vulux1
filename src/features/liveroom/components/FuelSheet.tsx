import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, PanResponder, Animated, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../components';
import { CashIcon } from '../../../components/CashIcon';
import { colors, radius, spacing } from '../../../theme';
import { IDLE_REFUEL_RECEIPT, type RefuelReceiptState } from '../refuelFlow';
import { FuelFillAmount, FUEL_COSTS, MAX_FUEL_MINUTES } from '../types';
import { hapticTap } from '../../../utils/haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Premium purple color
const FUEL_PURPLE = colors.accentPremium;

type FuelSheetProps = {
  visible: boolean;
  onClose: () => void;
  onFill: (amount: FuelFillAmount, paymentType: 'gems' | 'cash') => void;
  currentFuel: number; // current fuel units (drains by 1 every second)
  userGems?: number;
  userCash?: number;
  receipt?: RefuelReceiptState;
};

const FILL_AMOUNTS: FuelFillAmount[] = [30, 60, 120, 300, 600];

export function FuelSheet({
  visible,
  onClose,
  onFill,
  currentFuel,
  userGems = 0,
  userCash = 0,
  receipt = IDLE_REFUEL_RECEIPT,
}: FuelSheetProps) {
  const insets = useSafeAreaInsets();
  const [selectedAmount, setSelectedAmount] = useState<FuelFillAmount>(30);
  const [paymentType, setPaymentType] = useState<'gems' | 'cash'>('gems');
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const onCloseRef = useRef(onClose);
  const isPendingRef = useRef(false);
  const isPending = receipt.status === 'pending';
  const isSuccess = receipt.status === 'success';
  const controlsLocked = isPending || isSuccess;
  const balanceAfter = isSuccess ? receipt.balanceAfter : undefined;
  const displayedFuel = balanceAfter?.fuel ?? currentFuel;

  // Keep onClose ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // Animate in when modal opens
  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    }
  }, [visible]);

  // Pan responder for swipe-down to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isPendingRef.current,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isPendingRef.current) {
          return false;
        }
        return gestureState.dy > 5 || Math.abs(gestureState.dy) > 8;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (isPendingRef.current) {
          return false;
        }
        return gestureState.dy > 15;
      },
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onCloseRef.current();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const handleFill = () => {
    hapticTap();
    if (isSuccess) {
      onClose();
      return;
    }
    onFill(selectedAmount, paymentType);
  };

  const cost = FUEL_COSTS[selectedAmount];
  const currentCost = paymentType === 'gems' ? cost.gems : cost.cash;
  const canAfford = paymentType === 'gems' ? userGems >= cost.gems : userCash >= cost.cash;

  const formatRemainingTime = (fuelUnits: number) => {
    const totalSeconds = Math.max(0, Math.floor(fuelUnits));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  };

  const formatFillAmount = (mins: number) => {
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remaining = mins % 60;
      return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
    }
    return `${mins}m`;
  };

  const fuelPercentage = Math.min((displayedFuel / MAX_FUEL_MINUTES) * 100, 100);

  const fillButtonDisabled = isPending || (!canAfford && !isSuccess);
  const fillButtonText = isPending
    ? 'Processing...'
    : isSuccess
      ? 'Done'
      : !canAfford
        ? `Not enough ${paymentType === 'gems' ? 'Gems' : 'Cash'}`
        : `Fill +${formatFillAmount(selectedAmount)}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <View style={styles.container}>
        {/* Backdrop tap to close */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={isPending ? undefined : onClose}
        />

        {/* Sheet with pan handlers */}
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + spacing.lg,
              transform: [{ translateY }],
            }
          ]}
          {...panResponder.panHandlers}
        >
          {/* Drag Handle */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header with close */}
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel="Close fuel sheet"
            >
              <Ionicons name="chevron-down" size={28} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Fuel Badge - Large Rocket */}
          <View style={styles.badgeContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="rocket" size={28} color="#fff" />
            </View>
            <AppText style={styles.fuelLevelBadge}>{formatRemainingTime(currentFuel)}</AppText>
          </View>

          {/* Title */}
          <AppText style={styles.title}>Fuel Up The Tank</AppText>
          <AppText style={styles.subtitle}>
            Keep the live stream powered with GemPlus fuel
          </AppText>

          {/* Stats Card - Current Level */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <AppText style={styles.statValue}>{formatRemainingTime(displayedFuel)}</AppText>
                <AppText style={styles.statLabel}>Current Tank Level</AppText>
              </View>
            </View>

            {/* Tank Progress Bar */}
            <View style={styles.tankTrack}>
              <View
                style={[
                  styles.tankFill,
                  { width: `${fuelPercentage}%` }
                ]}
              />
            </View>
            <AppText style={styles.tankCapacityText}>
              {Math.round(fuelPercentage)}% Full
            </AppText>
          </View>

          {receipt.status !== 'idle' ? (
            <View
              style={[
                styles.statusCard,
                receipt.status === 'success'
                  ? styles.statusCardSuccess
                  : receipt.status === 'failure'
                    ? styles.statusCardFailure
                    : styles.statusCardPending,
              ]}
            >
              <View style={styles.statusRow}>
                {receipt.status === 'pending' ? (
                  <ActivityIndicator color={colors.accentPrimary} size="small" />
                ) : receipt.status === 'success' ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.accentSuccess} />
                ) : (
                  <Ionicons name="alert-circle" size={18} color={colors.accentDanger} />
                )}
                <AppText style={styles.statusTitle}>{receipt.title}</AppText>
              </View>
              <AppText style={styles.statusMessage}>{receipt.message}</AppText>
              {balanceAfter ? (
                <AppText style={styles.statusBalance}>
                  Wallet now: {balanceAfter.gems} Gems • {balanceAfter.cash} Cash • {balanceAfter.fuel}m Fuel
                </AppText>
              ) : null}
            </View>
          ) : null}

          {/* Payment Method Selector */}
          <View style={styles.paymentSelector}>
            <Pressable
              style={[styles.paymentOption, paymentType === 'gems' && styles.paymentOptionSelected]}
              onPress={() => { hapticTap(); setPaymentType('gems'); }}
              disabled={controlsLocked}
            >
              <Ionicons name="prism" size={16} color={paymentType === 'gems' ? colors.accentPremium : colors.textSecondary} />
              <AppText style={[styles.paymentText, paymentType === 'gems' && styles.paymentTextSelected]}>Pay with Gems</AppText>
            </Pressable>
            <Pressable
              style={[styles.paymentOption, paymentType === 'cash' && styles.paymentOptionSelected]}
              onPress={() => { hapticTap(); setPaymentType('cash'); }}
              disabled={controlsLocked}
            >
              <CashIcon size={16} color={paymentType === 'cash' ? colors.accentSuccess : colors.textSecondary} />
              <AppText style={[styles.paymentText, paymentType === 'cash' && styles.paymentTextSelected]}>Pay with Cash</AppText>
            </Pressable>
          </View>

          {/* Fill Amount Pills */}
          <View style={styles.amountsRow}>
            {FILL_AMOUNTS.map((amount) => (
              <Pressable
                key={amount}
                style={[
                  styles.amountPill,
                  selectedAmount === amount && styles.amountPillSelected,
                ]}
                onPress={() => {
                  hapticTap();
                  setSelectedAmount(amount);
                }}
                disabled={controlsLocked}
              >
                <AppText style={[
                  styles.amountText,
                  selectedAmount === amount && styles.amountTextSelected,
                ]}>
                  +{formatFillAmount(amount)}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* Fill Button */}
          <Pressable
            style={[
              styles.fillButton,
              fillButtonDisabled && styles.fillButtonDisabled,
            ]}
            onPress={handleFill}
            disabled={fillButtonDisabled}
          >
            <AppText style={styles.fillButtonText}>
              {fillButtonText}
            </AppText>
            {!isPending && !isSuccess && canAfford && (
              <View style={styles.costBadge}>
                {paymentType === 'gems' ? (
                  <Ionicons name="prism" size={18} color={colors.accentPremium} />
                ) : (
                  <CashIcon size={18} color={colors.accentSuccess} />
                )}
                <AppText style={styles.costText}>{currentCost}</AppText>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  header: {
    marginBottom: spacing.xs,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badge
  badgeContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: FUEL_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: `0px 6px 16px ${FUEL_PURPLE}80`,
      },
      default: {
        shadowColor: FUEL_PURPLE,
        shadowOpacity: 0.5,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
    }),
  },

  fuelLevelBadge: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: FUEL_PURPLE,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: -8,
    overflow: 'hidden',
    borderColor: colors.surface,
    borderWidth: 2,
  },

  // Text
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    marginBottom: spacing.lg,
  },

  // Stats Card
  statsCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: FUEL_PURPLE,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Tank Progress
  tankTrack: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 4,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  tankFill: {
    height: '100%',
    backgroundColor: FUEL_PURPLE,
    borderRadius: 4,
  },
  tankCapacityText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
  statusCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  statusCardPending: {
    backgroundColor: colors.surfaceAlt,
  },
  statusCardSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.28)',
  },
  statusCardFailure: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statusBalance: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },

  // Payment Selector
  paymentSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.md,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  paymentOptionSelected: {
    backgroundColor: colors.surface,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  paymentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  paymentTextSelected: {
    color: colors.textPrimary,
  },

  // Amount Pills
  amountsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  amountPill: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  amountPillSelected: {
    borderColor: FUEL_PURPLE,
    backgroundColor: 'rgba(190, 56, 243, 0.15)',
  },
  amountText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  amountTextSelected: {
    color: FUEL_PURPLE,
  },

  // Fill Button
  fillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FUEL_PURPLE,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: `0px 4px 12px ${FUEL_PURPLE}66`,
      },
      default: {
        shadowColor: FUEL_PURPLE,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  fillButtonDisabled: Platform.select({
    web: {
      backgroundColor: colors.surfaceAlt,
      boxShadow: 'none',
    },
    default: {
      backgroundColor: colors.surfaceAlt,
      shadowOpacity: 0,
    },
  }),
  fillButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  costBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  costText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
