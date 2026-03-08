import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Switch,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '../src/components';
import { colors, radius, spacing } from '../src/theme';
import { hapticTap } from '../src/utils/haptics';
import {
  blurActiveWebElement,
  lockPortraitOrientationSafely,
  unlockOrientationSafely,
} from '../src/utils/webRuntimeCompat';
import { useWallet } from '../src/context/WalletContext';
import { FuelSheet } from '../src/features/liveroom/components/FuelSheet';
import {
  buildRefuelPendingReceipt,
  IDLE_REFUEL_RECEIPT,
  runRefuelAction,
  type RefuelReceiptState,
} from '../src/features/liveroom/refuelFlow';
import { FUEL_COSTS, FuelFillAmount, MAX_FUEL_MINUTES } from '../src/features/liveroom/types';
import { buildFailureReceipt } from '../src/features/shop/shopReceipts';
import { useLive } from '../src/context/LiveContext';
import { toast } from '../src/components/Toast';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';

const GO_LIVE_BUTTON_GRADIENT = ['#3B82F6', '#2563EB'] as const;
const LIVE_TITLE_MIN_LENGTH = 3;
const LIVE_TITLE_MAX_LENGTH = 80;

export default function GoLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useSessionAuth();
  const { startLive, activeLive, liveRoom } = useLive();
  const { fuel, gems, cash, walletStateAvailable } = useWallet();

  const [title, setTitle] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [showFuelSheet, setShowFuelSheet] = useState(false);
  const [refuelReceipt, setRefuelReceipt] = useState<RefuelReceiptState>(IDLE_REFUEL_RECEIPT);
  const [pendingStart, setPendingStart] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const normalizedTitle = title.trim();
  const isOutOfFuel = walletStateAvailable && fuel <= 0;
  const hasValidTitle = normalizedTitle.length >= LIVE_TITLE_MIN_LENGTH;
  const canStartLive = hasValidTitle && !isOutOfFuel && !pendingStart;
  const canPressPrimaryCta = !pendingStart && (isOutOfFuel || hasValidTitle);
  const startDisabledHint =
    pendingStart
      ? null
      : isOutOfFuel
      ? 'You are out of fuel. Tap Live Fuel to refuel.'
      : !hasValidTitle
        ? `Title must be at least ${LIVE_TITLE_MIN_LENGTH} characters.`
        : null;

  // Lock orientation to portrait
  useEffect(() => {
    void lockPortraitOrientationSafely();
    return () => {
      void unlockOrientationSafely();
    };
  }, []);

  const openFuelSheet = () => {
    Keyboard.dismiss();
    blurActiveWebElement();
    setRefuelReceipt(IDLE_REFUEL_RECEIPT);
    setShowFuelSheet(true);
  };

  const closeFuelSheet = () => {
    if (refuelReceipt.status === 'pending') {
      return;
    }
    setShowFuelSheet(false);
    setRefuelReceipt(IDLE_REFUEL_RECEIPT);
  };

  const handleStartLive = async () => {
    if (pendingStart) return;
    hapticTap();
    if (isOutOfFuel) {
      openFuelSheet();
      return;
    }
    if (!hasValidTitle) {
      return;
    }
    setPendingStart(true);
    setStartError(null);
    try {
      const startResult = await startLive(normalizedTitle, inviteOnly);
      if (!startResult.ok) {
        setPendingStart(false);
        setStartError(startResult.message);
        toast.error(startResult.message);
      }
    } catch {
      setPendingStart(false);
      const message = 'Unable to start live right now. Please try again.';
      setStartError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (!pendingStart) return;
    if (!activeLive || !liveRoom) return;

    setPendingStart(false);
    setStartError(null);
    router.replace({
      pathname: '/live',
      params: { id: activeLive.id || liveRoom.id },
    });
  }, [activeLive, liveRoom, pendingStart, router]);

  const handleClose = () => {
    hapticTap();
    router.back();
  };

  const handleFillFuel = async (amount: FuelFillAmount, paymentType: 'gems' | 'cash') => {
    if (refuelReceipt.status === 'pending') {
      return;
    }

    if (refuelReceipt.status === 'success') {
      closeFuelSheet();
      return;
    }

    const cost = FUEL_COSTS[amount];
    const canAfford = paymentType === 'gems' ? gems >= cost.gems : cash >= cost.cash;

    if (!canAfford) {
      setRefuelReceipt(
        buildFailureReceipt(
          'purchase_fuel',
          `You need ${paymentType === 'gems' ? cost.gems : cost.cash} ${paymentType === 'gems' ? 'Gems' : 'Cash'} to buy this fuel pack.`,
        ),
      );
      return;
    }

    if (!userId) {
      setRefuelReceipt(buildFailureReceipt('purchase_fuel', 'Sign in required to refuel.'));
      return;
    }

    if (fuel >= MAX_FUEL_MINUTES) {
      setRefuelReceipt(buildFailureReceipt('purchase_fuel', 'Your fuel tank is already full.'));
      return;
    }

    setRefuelReceipt(buildRefuelPendingReceipt(amount));
    const nextReceipt = await runRefuelAction({
      userId,
      amount,
      paymentType,
      source: 'go_live_refuel',
    });
    setRefuelReceipt(nextReceipt);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[colors.background, '#1a1a2a']}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={28} color={colors.textSecondary} />
            </Pressable>
            <AppText style={styles.headerTitle}>Go Live</AppText>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.mainContent}>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={[colors.accentPrimary, colors.accentPrimarySoft]}
                style={styles.iconGradient}
              >
                <Ionicons name="radio-outline" size={48} color="#fff" />
              </LinearGradient>
            </View>

            <AppText style={styles.description}>
              Start streaming to your followers and build your community
            </AppText>

            {/* Title Input */}
            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>Live Title</AppText>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.titleInput}
                  placeholder="What's your live about?"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    if (startError) {
                      setStartError(null);
                    }
                  }}
                  editable={!pendingStart}
                  maxLength={LIVE_TITLE_MAX_LENGTH}
                />
                <AppText style={styles.charCount}>{title.length}/{LIVE_TITLE_MAX_LENGTH}</AppText>
              </View>
            </View>

            {/* Invite Only Toggle */}
            <View style={styles.toggleSection}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleIcon}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.accentPrimary} />
                </View>
                <View style={styles.toggleText}>
                  <AppText style={styles.toggleLabel}>Invite Only</AppText>
                  <AppText style={styles.toggleDescription}>
                    Only invited friends can join
                  </AppText>
                </View>
              </View>
              <Switch
                value={inviteOnly}
                onValueChange={(value) => {
                  hapticTap();
                  setInviteOnly(value);
                  if (startError) {
                    setStartError(null);
                  }
                }}
                disabled={pendingStart}
                trackColor={{ false: colors.surfaceAlt, true: colors.accentPrimary }}
                thumbColor="#fff"
              />
            </View>

            <Pressable
              style={[styles.fuelWidget, fuel <= 0 && styles.fuelWidgetEmpty]}
              onPress={() => {
                if (pendingStart) return;
                hapticTap();
                openFuelSheet();
              }}
              disabled={pendingStart}
            >
              <View style={styles.fuelWidgetInfo}>
                <View
                  style={[styles.fuelIconContainer, fuel <= 0 && styles.fuelIconContainerEmpty]}
                >
                  <Ionicons
                    name={fuel > 0 ? 'flame' : 'flame-outline'}
                    size={20}
                    color={fuel > 0 ? colors.accentPremium : colors.accentWarning}
                  />
                </View>
                <View style={styles.fuelWidgetText}>
                  <AppText style={styles.fuelLabel}>Live Fuel</AppText>
                  <AppText
                    style={[styles.fuelDescription, fuel <= 0 && styles.fuelDescriptionEmpty]}
                  >
                    {fuel > 0 ? `${fuel} minutes remaining` : 'Out of fuel. Tap to refuel!'}
                  </AppText>
                </View>
              </View>

              <View style={styles.fuelAddButton}>
                <Ionicons name="add" size={20} color="#fff" />
              </View>
            </Pressable>
          </View>

          {/* Start Live Button */}
          <View style={styles.footer}>
            <Pressable
              style={[
                styles.startButton,
                (!canStartLive || isOutOfFuel) && styles.startButtonDisabled,
                !canPressPrimaryCta && styles.startButtonDisabled,
              ]}
              onPress={handleStartLive}
              disabled={!canPressPrimaryCta}
            >
              <LinearGradient
                colors={GO_LIVE_BUTTON_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.startButtonGradient}
              >
                {pendingStart ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <AppText style={styles.startButtonText}>Starting Live...</AppText>
                  </>
                ) : (
                  <>
                    <AppText style={styles.startButtonText}>
                      {isOutOfFuel ? 'Refuel To Go Live' : startError ? 'Retry Start Live' : 'Start Live'}
                    </AppText>
                    <Ionicons
                      name={isOutOfFuel ? 'flame' : 'arrow-forward'}
                      size={20}
                      color="#fff"
                    />
                  </>
                )}
              </LinearGradient>
            </Pressable>
            {startError ? (
              <>
                <AppText style={styles.validationHintError}>{startError}</AppText>
                <Pressable onPress={handleStartLive} disabled={!canPressPrimaryCta} style={styles.retryButton}>
                  <AppText style={styles.retryButtonText}>
                    {isOutOfFuel ? 'Open Live Fuel' : 'Retry'}
                  </AppText>
                </Pressable>
              </>
            ) : startDisabledHint ? (
              <AppText style={styles.validationHint}>{startDisabledHint}</AppText>
            ) : null}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
      <FuelSheet
        visible={showFuelSheet}
        onClose={closeFuelSheet}
        onFill={handleFillFuel}
        currentFuel={fuel}
        userGems={gems}
        userCash={cash}
        receipt={refuelReceipt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mainContent: {
    paddingHorizontal: spacing.xl,
    flex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: `0px 4px 10px ${colors.accentPrimary}4D`,
      },
      default: {
        shadowColor: colors.accentPrimary,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  description: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.xl * 1.5,
    lineHeight: 22,
  },

  // Input Section
  inputSection: {
    marginBottom: spacing.xl,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    height: 56,
  },
  titleInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: colors.textPrimary,
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },

  // Toggle Section
  toggleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    gap: 2,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleDescription: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Fuel Widget
  fuelWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginTop: spacing.md,
  },
  fuelWidgetEmpty: {
    borderColor: 'rgba(255, 170, 0, 0.3)',
    backgroundColor: 'rgba(255, 170, 0, 0.05)',
  },
  fuelWidgetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  fuelIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(154, 42, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fuelIconContainerEmpty: {
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
  },
  fuelWidgetText: {
    flex: 1,
  },
  fuelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fuelDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fuelDescriptionEmpty: {
    color: colors.accentWarning,
    fontWeight: '500',
  },
  fuelAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },


  // Footer
  footer: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl * 2,
  },
  startButton: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 12px rgba(59, 130, 246, 0.4)',
      },
      default: {
        shadowColor: '#3B82F6',
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  startButtonDisabled: {
    opacity: 0.55,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: spacing.sm,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  validationHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    textAlign: 'center',
    color: colors.textMuted,
  },
  validationHintError: {
    marginTop: spacing.sm,
    fontSize: 12,
    textAlign: 'center',
    color: colors.accentDanger,
  },
  retryButton: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  retryButtonText: {
    fontSize: 13,
    color: colors.accentPrimary,
    fontWeight: '600',
  },
});
