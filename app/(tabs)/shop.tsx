import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { AppScreen, AppText, PillTabs, SectionCard } from '../../src/components';
import type { PillTabItem } from '../../src/components';
import { toast } from '../../src/components/Toast';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { colors, spacing } from '../../src/theme';
import { useWallet, type WithdrawalRequest } from '../../src/context';
import { FUEL_COSTS, FuelFillAmount, MAX_FUEL_MINUTES } from '../../src/features/liveroom/types';
import { ShopHeader } from '../../src/features/shop/components/ShopHeader';
import { ShopBuyTab } from '../../src/features/shop/ShopBuyTab';
import { ShopEarnTab } from '../../src/features/shop/ShopEarnTab';
import { ShopWalletTab } from '../../src/features/shop/ShopWalletTab';
import { WithdrawalModal } from '../../src/features/shop/WithdrawalModal';
import { ShopTab } from '../../src/features/shop/types';
import {
  DEFAULT_MIN_WITHDRAWAL_GEMS,
  getWithdrawalEligibility,
} from '../../src/features/shop/withdrawalEligibility';
import { useAuth as useSessionAuth } from '../../src/auth/spacetimeSession';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { requestBackendRefresh } from '../../src/data/adapters/backend/refreshBus';
import { subscribeBootstrap } from '../../src/lib/spacetime';
import {
  claimAdReward,
  convertCashToGems,
  convertGemsToCash,
  creditGemsPurchase,
  purchaseFuelPack,
} from '../../src/data/adapters/backend/walletMutations';
import {
  fetchMyWalletBalance,
  waitForWalletTransaction,
} from '../../src/data/adapters/backend/walletQueries';
import {
  buildFailureReceipt,
  buildPendingReceipt,
  buildSuccessReceipt,
  matchesWalletTransaction,
  type ShopOperationKind,
  type ShopReceiptState,
  type WalletTransactionMatchSpec,
} from '../../src/features/shop/shopReceipts';

const IDLE_RECEIPT: ShopReceiptState = {
  status: 'idle',
  kind: null,
  title: '',
  message: '',
};

export default function ShopScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useSessionAuth();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const { 
    gems, 
    cash, 
    fuel, 
    requestWithdrawal,
    withdrawalHistory,
    walletHydrated,
    walletStateAvailable,
  } = useWallet();

  const [activeTab, setActiveTab] = useState<ShopTab>('buy');
  const [fuelPaymentType, setFuelPaymentType] = useState<'gems' | 'cash'>('gems');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const [receipt, setReceipt] = useState<ShopReceiptState>(IDLE_RECEIPT);

  // Withdrawal Form State
  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState(false);

  // Confirm sheet state
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    icon?: any;
    iconColor?: string;
    confirmColor?: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', onConfirm: () => {} });

  const showConfirm = useCallback((opts: Omit<typeof confirmSheet, 'visible'>) => {
    setConfirmSheet({ ...opts, visible: true });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmSheet(prev => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    requestBackendRefresh();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeBootstrap();
  }, [queriesEnabled]);

  const dismissReceipt = useCallback(() => {
    setReceipt(IDLE_RECEIPT);
  }, []);

  const tabItems = useMemo<PillTabItem[]>(
    () => [
      {
        key: 'buy',
        label: 'Store',
        icon: 'cart',
        accentColor: colors.accentPrimary,
      },
      {
        key: 'earn',
        label: 'Earn',
        icon: 'gift',
        accentColor: colors.accentSuccess,
      },
      {
        key: 'wallet',
        label: 'Wallet',
        icon: 'wallet',
        accentColor: colors.accentPremium,
      },
    ],
    []
  );

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as ShopTab);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const MIN_WITHDRAWAL_GEMS = DEFAULT_MIN_WITHDRAWAL_GEMS;
  const isActionPending = receipt.status === 'pending';
  const withdrawalEligibility = useMemo(
    () =>
      getWithdrawalEligibility({
        gems,
        walletHydrated,
        walletStateAvailable,
        minWithdrawalGems: MIN_WITHDRAWAL_GEMS,
      }),
    [MIN_WITHDRAWAL_GEMS, gems, walletHydrated, walletStateAvailable],
  );

  const runWalletAction = useCallback(
    async (params: {
      kind: ShopOperationKind;
      pendingTitle: string;
      pendingMessage: string;
      failureMessage: string;
      successToast: string;
      match: WalletTransactionMatchSpec;
      mutate: () => Promise<{
        ok: boolean;
        message?: string;
      }>;
    }) => {
      if (isActionPending) {
        return;
      }

      const actionStartedAtMs = Date.now();

      setReceipt(
        buildPendingReceipt(params.kind, params.pendingTitle, params.pendingMessage),
      );

      const result = await params.mutate();
      if (!result.ok) {
        const failureMessage = result.message ?? params.failureMessage;
        setReceipt(buildFailureReceipt(params.kind, failureMessage));
        toast.error(failureMessage);
        return;
      }

      const transaction = await waitForWalletTransaction((row) =>
        matchesWalletTransaction(row, {
          ...params.match,
          createdAfterMs: actionStartedAtMs,
        }),
      );

      if (transaction) {
        const nextReceipt = buildSuccessReceipt(params.kind, transaction);
        setReceipt(nextReceipt);
        toast.success(params.successToast);
        return;
      }

      const balance = fetchMyWalletBalance();
      setReceipt({
        status: 'success',
        kind: params.kind,
        title: 'Wallet updated',
        message: 'The server accepted your request and refreshed your wallet.',
        balanceAfter: balance
          ? {
              gems: balance.gems,
              cash: balance.cash,
              fuel: balance.fuel,
            }
          : undefined,
      });
      toast.success(params.successToast);
    },
    [isActionPending],
  );

  const handleWatchAd = useCallback(async () => {
    if (isActionPending) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingAd(true);
    
    // Ad loading simulation
    setTimeout(async () => {
      setIsLoadingAd(false);
      if (!userId) {
        toast.error('Sign in required to claim rewards.');
        return;
      }

      await runWalletAction({
        kind: 'claim_reward',
        pendingTitle: 'Claiming reward',
        pendingMessage: 'Waiting for the server to record your reward.',
        failureMessage: 'Could not claim ad reward right now.',
        successToast: 'You earned 10 gems!',
        match: {
          eventType: 'claim_ad_reward',
          source: 'shop_watch_ad',
          deltaGems: 10,
        },
        mutate: () => claimAdReward(userId, 'shop_watch_ad'),
      });
    }, 1500);
  }, [isActionPending, runWalletAction, userId]);

  const handleBuyGems = (amount: number, price: string) => {
    showConfirm({
      title: 'Confirm Purchase',
      message: `Buy ${amount} Gems for ${price}?`,
      confirmLabel: 'Buy',
      icon: 'prism',
      iconColor: colors.accentPremium,
      confirmColor: colors.accentPremium,
      onConfirm: async () => {
        hideConfirm();
        if (!userId) {
          toast.error('Sign in required to purchase gems.');
          return;
        }

        const purchaseToken = `shop-${userId}-${Date.now()}-${amount}`;
        await runWalletAction({
          kind: 'purchase_gems',
          pendingTitle: 'Processing purchase',
          pendingMessage: `Waiting for the server to record your ${amount} Gems purchase.`,
          failureMessage: 'Purchase could not be completed.',
          successToast: `You received ${amount} Gems!`,
          match: {
            eventType: 'credit_gems_purchase',
            purchaseToken,
          },
          mutate: () =>
            creditGemsPurchase(
              userId,
              amount,
              purchaseToken,
              price,
              'shop_buy_gems',
            ),
        });
      },
    });
  };

  const handleSubscribe = () => {
    setIsSubscribed(true);
    setAutoRenew(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success('Welcome to Gem+. Enjoy your weekly rewards.');
  };

  const handleCancelSubscription = useCallback(() => {
    setAutoRenew(false);
  }, []);

  const handleResumeSubscription = useCallback(() => {
    setAutoRenew(true);
  }, []);

  const handleFuelPaymentTypeChange = useCallback(
    (value: 'gems' | 'cash') => {
      setFuelPaymentType(value);
    },
    []
  );

  const handleRefuel = (amount: FuelFillAmount) => {
    if (isActionPending) {
      return;
    }
    if (fuel >= MAX_FUEL_MINUTES) {
      toast.info('Your fuel tank is already full!');
      return;
    }

    const cost = FUEL_COSTS[amount];
    const price = fuelPaymentType === 'gems' ? cost.gems : cost.cash;
    const currencyName = fuelPaymentType === 'gems' ? 'Gems' : 'Cash';
    const canAfford = fuelPaymentType === 'gems' ? gems >= cost.gems : cash >= cost.cash;

    if (!canAfford) {
      toast.warning(`You need ${price} ${currencyName} to buy this fuel pack.`);
      return;
    }

    showConfirm({
      title: 'Confirm Refuel',
      message: `Buy ${formatTime(amount)} fuel for ${price} ${currencyName}?`,
      confirmLabel: 'Fill Tank',
      icon: 'flash',
      iconColor: colors.accentWarning,
      confirmColor: colors.accentPrimary,
      onConfirm: async () => {
        hideConfirm();
        if (!userId) {
          toast.error('Sign in required to refuel.');
          return;
        }
        await runWalletAction({
          kind: 'purchase_fuel',
          pendingTitle: 'Processing refuel',
          pendingMessage: `Waiting for the server to credit ${formatTime(amount)} fuel.`,
          failureMessage: 'Refuel failed. Please try again.',
          successToast: 'Fuel tank replenished!',
          match: {
            eventType: 'purchase_fuel_pack',
            source: 'shop_refuel',
            deltaFuel: amount,
            deltaGems: fuelPaymentType === 'gems' ? -cost.gems : 0,
            deltaCash: fuelPaymentType === 'cash' ? -cost.cash : 0,
          },
          mutate: () =>
            purchaseFuelPack(
              userId,
              amount,
              fuelPaymentType,
              'shop_refuel',
            ),
        });
      },
    });
  };

  const handleGemsToCash = (gemAmount: number) => {
    showConfirm({
      title: 'Convert to Cash',
      message: `Convert ${gemAmount} Gems to ${gemAmount * 10} Cash?`,
      confirmLabel: 'Convert',
      icon: 'swap-horizontal',
      iconColor: colors.accentSuccess,
      confirmColor: colors.accentSuccess,
      onConfirm: async () => {
        hideConfirm();
        if (!userId) {
          toast.error('Sign in required to exchange currencies.');
          return;
        }
        await runWalletAction({
          kind: 'exchange_currency',
          pendingTitle: 'Processing exchange',
          pendingMessage: 'Waiting for the server to settle your Gems to Cash exchange.',
          failureMessage: 'Conversion failed.',
          successToast: 'Conversion complete!',
          match: {
            eventType: 'convert_gems_to_cash',
            source: 'wallet_convert_gems_to_cash',
            deltaGems: -gemAmount,
            deltaCash: gemAmount * 10,
          },
          mutate: () => convertGemsToCash(userId, gemAmount),
        });
      },
    });
  };

  const handleCashToGems = (cashAmount: number) => {
    const gemAmount = Math.floor(cashAmount / 10);
    showConfirm({
      title: 'Convert to Gems',
      message: `Convert ${cashAmount} Cash to ${gemAmount} Gems?`,
      confirmLabel: 'Convert',
      icon: 'swap-horizontal',
      iconColor: colors.accentPremium,
      confirmColor: colors.accentPremium,
      onConfirm: async () => {
        hideConfirm();
        if (!userId) {
          toast.error('Sign in required to exchange currencies.');
          return;
        }
        await runWalletAction({
          kind: 'exchange_currency',
          pendingTitle: 'Processing exchange',
          pendingMessage: 'Waiting for the server to settle your Cash to Gems exchange.',
          failureMessage: 'Conversion failed.',
          successToast: 'Conversion complete!',
          match: {
            eventType: 'convert_cash_to_gems',
            source: 'wallet_convert_cash_to_gems',
            deltaCash: -cashAmount,
            deltaGems: gemAmount,
          },
          mutate: () => convertCashToGems(userId, cashAmount),
        });
      },
    });
  };

  const handleOpenWithdrawal = useCallback(() => {
    if (!withdrawalEligibility.canRequestWithdrawal) {
      toast.info(withdrawalEligibility.disabledReason ?? 'Withdrawal is unavailable right now.');
      return;
    }
    setIsWithdrawModalVisible(true);
  }, [withdrawalEligibility]);

  const handleCloseWithdrawal = useCallback(() => {
    setIsWithdrawModalVisible(false);
  }, []);

  const handleViewHistory = useCallback(() => {
    router.push('/wallet-history');
  }, [router]);

  const handleSubmitWithdrawal = useCallback(
    (
      amount: number,
      details: WithdrawalRequest['details'],
      method: 'PayPal' | 'Bank'
    ) => requestWithdrawal(amount, details, method),
    [requestWithdrawal]
  );

  const handleEarnCashUnavailable = useCallback((_amount: number) => {
    toast.info('Cash rewards are temporarily unavailable.');
  }, []);

  const formatTime = (mins: number) => {
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remaining = mins % 60;
      return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
    }
    return `${mins}m`;
  };

  return (
    <AppScreen noPadding>
      <View style={styles.stickyHeader}>
        <ShopHeader gems={gems} cash={cash} />
      </View>

      <View style={styles.tabContainer}>
        <PillTabs
          items={tabItems}
          value={activeTab}
          onChange={handleTabChange}
          tabItemStyle={styles.tabItemTight}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {receipt.status !== 'idle' ? (
          <ShopReceiptCard receipt={receipt} onDismiss={dismissReceipt} />
        ) : null}

        {activeTab === 'buy' && (
          <ShopBuyTab
            isSubscribed={isSubscribed}
            autoRenew={autoRenew}
            onSubscribe={handleSubscribe}
            onCancelSubscription={handleCancelSubscription}
            onResumeSubscription={handleResumeSubscription}
            onWatchAd={handleWatchAd}
            isLoadingAd={isLoadingAd}
            onBuyGems={handleBuyGems}
            fuelPaymentType={fuelPaymentType}
            onFuelPaymentTypeChange={handleFuelPaymentTypeChange}
            fuel={fuel}
            gems={gems}
            cash={cash}
            onRefuel={handleRefuel}
            isActionPending={isActionPending}
          />
        )}

        {activeTab === 'earn' && <ShopEarnTab onAddCash={handleEarnCashUnavailable} />}

        {activeTab === 'wallet' && (
          <ShopWalletTab
            gems={gems}
            cash={cash}
            withdrawalHistory={withdrawalHistory}
            withdrawalEligibility={withdrawalEligibility}
            onExchangeGemsToCash={handleGemsToCash}
            onExchangeCashToGems={handleCashToGems}
            onOpenWithdrawal={handleOpenWithdrawal}
            onViewHistory={handleViewHistory}
            isActionPending={isActionPending}
          />
        )}
      </ScrollView>

      <WithdrawalModal
        visible={isWithdrawModalVisible}
        gems={gems}
        canRequestWithdrawal={withdrawalEligibility.canRequestWithdrawal}
        disabledReason={withdrawalEligibility.disabledReason}
        onClose={handleCloseWithdrawal}
        onSubmit={handleSubmitWithdrawal}
        minWithdrawalGems={MIN_WITHDRAWAL_GEMS}
      />

      <ConfirmSheet
        visible={confirmSheet.visible}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        icon={confirmSheet.icon}
        iconColor={confirmSheet.iconColor}
        confirmColor={confirmSheet.confirmColor}
        onConfirm={confirmSheet.onConfirm}
        onCancel={hideConfirm}
      />
    </AppScreen>
  );
}

function formatReceiptBalances(balanceAfter?: ShopReceiptState['balanceAfter']): string | null {
  if (!balanceAfter) {
    return null;
  }

  return `Balance now: ${balanceAfter.gems} Gems, ${balanceAfter.cash} Cash, ${balanceAfter.fuel} Fuel`;
}

function ShopReceiptCard({
  receipt,
  onDismiss,
}: {
  receipt: ShopReceiptState;
  onDismiss: () => void;
}) {
  const isPending = receipt.status === 'pending';
  const isFailure = receipt.status === 'failure';
  const iconName = isPending
    ? 'time-outline'
    : isFailure
      ? 'alert-circle-outline'
      : 'checkmark-circle-outline';
  const accentColor = isPending
    ? colors.accentWarning
    : isFailure
      ? colors.accentDanger
      : colors.accentSuccess;
  const balanceLine = formatReceiptBalances(receipt.balanceAfter);

  return (
    <SectionCard
      title={receipt.title}
      style={[
        styles.receiptCard,
        { borderColor: `${accentColor}4D` },
      ]}
      action={
        !isPending ? (
          <Pressable onPress={onDismiss} style={styles.receiptDismissButton} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null
      }
    >
      <View style={styles.receiptContent}>
        <View style={[styles.receiptIconWrap, { backgroundColor: `${accentColor}1A` }]}>
          {isPending ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <Ionicons name={iconName} size={20} color={accentColor} />
          )}
        </View>
        <View style={styles.receiptTextWrap}>
          <AppText variant="small">{receipt.message}</AppText>
          {balanceLine ? (
            <AppText variant="tiny" secondary>
              {balanceLine}
            </AppText>
          ) : null}
          {receipt.transactionId ? (
            <AppText variant="tiny" secondary>
              Receipt: {receipt.transactionId}
            </AppText>
          ) : null}
        </View>
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  tabItemTight: {
    paddingVertical: spacing.smMinus,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: 120,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  receiptCard: {
    backgroundColor: colors.surfaceAlt,
  },
  receiptContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  receiptIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  receiptDismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
