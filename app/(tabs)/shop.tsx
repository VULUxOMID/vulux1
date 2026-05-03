import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { AppScreen, PillTabs } from '../../src/components';
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
import { useAuth as useSessionAuth } from '../../src/auth/clerkSession';
import {
  claimAdReward,
  convertCashToGems,
  convertGemsToCash,
  creditGemsPurchase,
  purchaseFuelPack,
} from '../../src/data/adapters/backend/walletMutations';

export default function ShopScreen() {
  const router = useRouter();
  const { userId } = useSessionAuth();
  const { 
    gems, 
    cash, 
    fuel, 
    requestWithdrawal,
    withdrawalHistory
  } = useWallet();

  const [activeTab, setActiveTab] = useState<ShopTab>('buy');
  const [fuelPaymentType, setFuelPaymentType] = useState<'gems' | 'cash'>('gems');
  const [isLoadingAd, setIsLoadingAd] = useState(false);

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

  const MIN_WITHDRAWAL_GEMS = 500; // $5.00

  const handleWatchAd = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingAd(true);
    
    // Ad loading simulation
    setTimeout(async () => {
      setIsLoadingAd(false);
      if (!userId) {
        toast.error('Sign in required to claim rewards.');
        return;
      }

      const result = await claimAdReward(userId, 'shop_watch_ad');
      if (result.ok) {
        toast.success('You earned 10 gems!');
      } else {
        toast.error(result.message ?? 'Could not claim ad reward right now.');
      }
    }, 1500);
  }, [userId]);

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
        const result = await creditGemsPurchase(
          userId,
          amount,
          purchaseToken,
          price,
          'shop_buy_gems',
        );
        if (result.ok) {
          toast.success(`You received ${amount} Gems!`);
        } else {
          toast.error(result.message ?? 'Purchase could not be completed.');
        }
      },
    });
  };

  const handleFuelPaymentTypeChange = useCallback(
    (value: 'gems' | 'cash') => {
      setFuelPaymentType(value);
    },
    []
  );

  const handleRefuel = (amount: FuelFillAmount) => {
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
        const result = await purchaseFuelPack(
          userId,
          amount,
          fuelPaymentType,
          'shop_refuel',
        );
        if (result.ok) {
          toast.success('Fuel tank replenished!');
        } else if (result.code === 'insufficient_balance') {
          toast.warning(`You need ${price} ${currencyName} to buy this fuel pack.`);
        } else {
          toast.error(result.message ?? 'Refuel failed. Please try again.');
        }
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
        const result = await convertGemsToCash(userId, gemAmount);
        if (result.ok) {
          toast.success('Conversion complete!');
        } else if (result.code === 'insufficient_balance') {
          toast.error('Not enough gems!');
        } else {
          toast.error(result.message ?? 'Conversion failed.');
        }
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
        const result = await convertCashToGems(userId, cashAmount);
        if (result.ok) {
          toast.success('Conversion complete!');
        } else if (result.code === 'insufficient_balance') {
          toast.error('Not enough cash!');
        } else {
          toast.error(result.message ?? 'Conversion failed.');
        }
      },
    });
  };

  const handleOpenWithdrawal = useCallback(() => {
    setIsWithdrawModalVisible(true);
  }, []);

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
        {activeTab === 'buy' && (
          <ShopBuyTab
            onWatchAd={handleWatchAd}
            isLoadingAd={isLoadingAd}
            onBuyGems={handleBuyGems}
            fuelPaymentType={fuelPaymentType}
            onFuelPaymentTypeChange={handleFuelPaymentTypeChange}
            fuel={fuel}
            gems={gems}
            cash={cash}
            onRefuel={handleRefuel}
          />
        )}

        {activeTab === 'earn' && <ShopEarnTab onAddCash={handleEarnCashUnavailable} />}

        {activeTab === 'wallet' && (
          <ShopWalletTab
            gems={gems}
            cash={cash}
            withdrawalHistory={withdrawalHistory}
            onExchangeGemsToCash={handleGemsToCash}
            onExchangeCashToGems={handleCashToGems}
            onOpenWithdrawal={handleOpenWithdrawal}
            onViewHistory={handleViewHistory}
          />
        )}
      </ScrollView>

      <WithdrawalModal
        visible={isWithdrawModalVisible}
        gems={gems}
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
const styles = StyleSheet.create({
  stickyHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  tabContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  tabItemTight: {
    paddingVertical: spacing.smMinus,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: 120,
    paddingHorizontal: spacing.lg,
  },
});
