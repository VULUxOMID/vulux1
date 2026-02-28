import React, { useCallback, useMemo, useRef, useState } from 'react';
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

export default function ShopScreen() {
  const router = useRouter();
  const { 
    gems, 
    cash, 
    fuel, 
    addGems,
    addCash,
    exchangeGemsForCash,
    exchangeCashForGems, 
    addFuel, 
    spendGems, 
    spendCash,
    requestWithdrawal,
    withdrawalHistory
  } = useWallet();

  const [activeTab, setActiveTab] = useState<ShopTab>('buy');
  const [fuelPaymentType, setFuelPaymentType] = useState<'gems' | 'cash'>('gems');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);
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

  const handleWatchAd = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingAd(true);
    
    // Ad loading simulation
    setTimeout(() => {
      setIsLoadingAd(false);
      addGems(10);
      toast.success('You earned 10 gems!');
    }, 1500);
  };

  const handleBuyGems = (amount: number, price: string) => {
    showConfirm({
      title: 'Confirm Purchase',
      message: `Buy ${amount} Gems for ${price}?`,
      confirmLabel: 'Buy',
      icon: 'prism',
      iconColor: colors.accentPremium,
      confirmColor: colors.accentPremium,
      onConfirm: () => {
        hideConfirm();
        addGems(amount);
        toast.success(`You received ${amount} Gems!`);
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
      onConfirm: () => {
        hideConfirm();
        const success = fuelPaymentType === 'gems' ? spendGems(cost.gems) : spendCash(cost.cash);
        if (success) {
          addFuel(amount);
          toast.success('Fuel tank replenished!');
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
      onConfirm: () => {
        hideConfirm();
        const success = exchangeGemsForCash(gemAmount);
        if (success) {
          toast.success('Conversion complete!');
        } else {
          toast.error('Not enough gems!');
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
      onConfirm: () => {
        hideConfirm();
        const success = exchangeCashForGems(cashAmount);
        if (success) {
          toast.success('Conversion complete!');
        } else {
          toast.error('Not enough cash!');
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
          />
        )}

        {activeTab === 'earn' && <ShopEarnTab onAddCash={addCash} />}

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
  },
});
