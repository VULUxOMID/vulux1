import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText, CashIcon, SectionCard, ToggleRow } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { GemPlusWidget } from '../home/widgets/GemPlusWidget';
import {
  FUEL_COSTS,
  FuelFillAmount,
  MAX_FUEL_MINUTES,
} from '../liveroom/types';

type ShopBuyTabProps = {
  isSubscribed: boolean;
  autoRenew: boolean;
  onSubscribe: () => void;
  onCancelSubscription: () => void;
  onResumeSubscription: () => void;
  onWatchAd: () => void;
  isLoadingAd: boolean;
  onBuyGems: (amount: number, price: string) => void;
  fuelPaymentType: 'gems' | 'cash';
  onFuelPaymentTypeChange: (value: 'gems' | 'cash') => void;
  fuel: number;
  gems: number;
  cash: number;
  onRefuel: (amount: FuelFillAmount) => void;
  isActionPending?: boolean;
};

export const ShopBuyTab = React.memo(function ShopBuyTab({
  isSubscribed,
  autoRenew,
  onSubscribe,
  onCancelSubscription,
  onResumeSubscription,
  onWatchAd,
  isLoadingAd,
  onBuyGems,
  fuelPaymentType,
  onFuelPaymentTypeChange,
  fuel,
  gems,
  cash,
  onRefuel,
  isActionPending = false,
}: ShopBuyTabProps) {
  const toggleOptions = useMemo(
    () => [
      {
        key: 'gems',
        accessibilityLabel: 'Pay with gems',
        renderIcon: (isActive: boolean) => (
          <Ionicons
            name="prism"
            size={14}
            color={isActive ? colors.accentPremium : colors.textMuted}
          />
        ),
      },
      {
        key: 'cash',
        accessibilityLabel: 'Pay with cash',
        renderIcon: (isActive: boolean) => (
          <CashIcon
            size={14}
            color={isActive ? colors.accentSuccess : colors.textMuted}
          />
        ),
      },
    ],
    []
  );

  const handlePaymentChange = useCallback(
    (value: string) => {
      onFuelPaymentTypeChange(value as 'gems' | 'cash');
    },
    [onFuelPaymentTypeChange]
  );

  const fuelPercent = Math.round((fuel / MAX_FUEL_MINUTES) * 100);
  const fuelPercentText = `${Math.min(fuelPercent, 100)}%`;

  return (
    <View style={styles.container}>
      <GemPlusWidget
        isSubscriber={isSubscribed}
        autoRenew={autoRenew}
        onSubscribe={onSubscribe}
        onCancelSubscription={onCancelSubscription}
        onResumeSubscription={onResumeSubscription}
        variant="shop"
      />

      <SectionCard title="Get Gems" contentStyle={styles.sectionContent}>
        <Pressable
          style={[
            styles.watchAdCard,
            (isLoadingAd || isActionPending) && styles.cardDisabled,
          ]}
          onPress={onWatchAd}
          disabled={isLoadingAd || isActionPending}
        >
          <View style={styles.watchAdContent}>
            <Ionicons
              name="play-circle"
              size={24}
              color={colors.accentPremium}
            />
            <AppText variant="body" style={styles.watchAdTitle}>
              Watch ad for gems
            </AppText>
          </View>
          <View style={styles.watchAdBadge}>
            <AppText variant="small" style={styles.watchAdBadgeText}>
              +10
            </AppText>
            <Ionicons name="prism" size={12} color={colors.accentPremium} />
          </View>
        </Pressable>

        <View style={styles.grid}>
          <GemCard
            amount={100}
            price="$0.99"
            onBuy={() => onBuyGems(100, '$0.99')}
            disabled={isActionPending}
          />
          <GemCard
            amount={550}
            price="$4.99"
            onBuy={() => onBuyGems(550, '$4.99')}
            recommended
            disabled={isActionPending}
          />
          <GemCard
            amount={1200}
            price="$9.99"
            onBuy={() => onBuyGems(1200, '$9.99')}
            disabled={isActionPending}
          />
          <GemCard
            amount={2500}
            price="$19.99"
            onBuy={() => onBuyGems(2500, '$19.99')}
            disabled={isActionPending}
          />
        </View>
      </SectionCard>

      <SectionCard
        title="Refuel Station"
        subtitle="Keep the live stream powered"
        action={
          <ToggleRow
            options={toggleOptions}
            value={fuelPaymentType}
            onChange={handlePaymentChange}
          />
        }
        contentStyle={styles.sectionContent}
      >
        <View style={styles.fuelProgressContainer}>
          <View style={styles.fuelProgressHeader}>
            <AppText variant="small" style={styles.fuelProgressLabel}>
              Tank Level: {fuelPercentText}
            </AppText>
            <AppText variant="small" secondary>
              {fuel}/{MAX_FUEL_MINUTES}m
            </AppText>
          </View>
          <View style={styles.fuelTrack}>
            <View
              style={[
                styles.fuelFill,
                { width: `${Math.min((fuel / MAX_FUEL_MINUTES) * 100, 100)}%` },
              ]}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {(Object.keys(FUEL_COSTS).map(Number) as FuelFillAmount[]).map(
            (amount) => {
              const cost = FUEL_COSTS[amount];
              const price =
                fuelPaymentType === 'gems' ? cost.gems : cost.cash;
              const canAfford =
                fuelPaymentType === 'gems' ? gems >= cost.gems : cash >= cost.cash;

              return (
                <RefuelCard
                  key={amount}
                  amount={amount}
                  price={price}
                  currency={fuelPaymentType}
                  onBuy={() => onRefuel(amount)}
                  canAfford={canAfford && !isActionPending}
                />
              );
            }
          )}
        </ScrollView>
      </SectionCard>
    </View>
  );
});

function formatTime(mins: number) {
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h`;
  }
  return `${mins}m`;
}

type RefuelCardProps = {
  amount: number;
  price: number;
  currency: 'gems' | 'cash';
  onBuy: () => void;
  canAfford: boolean;
};

function RefuelCard({
  amount,
  price,
  currency,
  onBuy,
  canAfford,
}: RefuelCardProps) {
  return (
    <Pressable
      style={[styles.refuelCard, !canAfford && styles.cardDisabled]}
      onPress={onBuy}
      disabled={!canAfford}
    >
      <View style={styles.refuelIconCircle}>
        <Ionicons name="rocket" size={24} color={colors.textPrimary} />
      </View>
      <AppText variant="h2" style={styles.refuelAmount}>
        +{formatTime(amount)}
      </AppText>
      <View style={styles.priceBadge}>
        {currency === 'gems' ? (
          <Ionicons
            name="prism"
            size={14}
            color={canAfford ? colors.accentPremium : colors.textMuted}
          />
        ) : (
          <CashIcon
            size={14}
            color={canAfford ? colors.accentSuccess : colors.textMuted}
          />
        )}
        <AppText
          variant="tiny"
          style={[styles.priceTextSmall, !canAfford && styles.textDisabled]}
        >
          {price}
        </AppText>
      </View>
    </Pressable>
  );
}

type GemCardProps = {
  amount: number;
  price: string;
  onBuy: () => void;
  recommended?: boolean;
  disabled?: boolean;
};

function GemCard({ amount, price, onBuy, recommended, disabled = false }: GemCardProps) {
  return (
    <Pressable
      style={[styles.card, recommended && styles.recommendedCard, disabled && styles.cardDisabled]}
      onPress={onBuy}
      disabled={disabled}
    >
      {recommended ? (
        <View style={styles.badge}>
          <AppText variant="tiny" style={styles.badgeText}>
            Popular
          </AppText>
        </View>
      ) : null}
      <Ionicons
        name="prism"
        size={32}
        color={colors.accentPremium}
        style={styles.cardIcon}
      />
      <AppText variant="h2">{amount}</AppText>
      <AppText variant="small" secondary>
        Gems
      </AppText>
      <View style={styles.priceButton}>
        <AppText variant="small" style={styles.priceText}>
          {price}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  sectionContent: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  recommendedCard: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  badge: {
    position: 'absolute',
    top: -spacing.md,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.xl,
  },
  badgeText: {
    color: colors.accentCashText,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardIcon: {
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  priceButton: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    marginTop: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  priceText: {
    fontWeight: '600',
  },
  watchAdCard: {
    width: '100%',
    backgroundColor: `${colors.accentPremium}1A`,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: `${colors.accentPremium}4D`,
  },
  watchAdContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  watchAdTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  watchAdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: `${colors.accentPremium}4D`,
  },
  watchAdBadgeText: {
    fontWeight: '700',
    color: colors.accentPremium,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  fuelProgressContainer: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  fuelProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  fuelProgressLabel: {
    fontWeight: '600',
  },
  fuelTrack: {
    height: spacing.sm + spacing.xxs,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  fuelFill: {
    height: '100%',
    backgroundColor: colors.accentPremium,
    borderRadius: radius.full,
  },
  horizontalScroll: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  refuelCard: {
    width: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  refuelIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accentPremium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refuelAmount: {
    textAlign: 'center',
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  priceTextSmall: {
    fontWeight: '700',
  },
  textDisabled: {
    color: colors.textMuted,
  },
});
