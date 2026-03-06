import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { AppButton, AppScreen, AppText, SectionCard } from '../../components';
import { toast } from '../../components/Toast';
import { useWallet } from '../../context';
import {
  shouldRefreshWalletFromBackendEvent,
  shouldRefreshWalletFromSpacetimeEvent,
} from '../../context/walletHydration';
import { useAuth as useSessionAuth } from '../../auth/spacetimeSession';
import { fetchAccountState } from '../../data/adapters/backend/accountState';
import {
  requestBackendRefresh,
  subscribeBackendRefresh,
} from '../../data/adapters/backend/refreshBus';
import {
  claimEarnAdWallReward,
  claimEarnStreakReward,
} from '../../data/adapters/backend/walletMutations';
import {
  fetchMyWalletBalance,
  waitForWalletTransaction,
} from '../../data/adapters/backend/walletQueries';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import {
  subscribeBootstrap,
  subscribeSpacetimeDataChanges,
} from '../../lib/spacetime';
import { colors, spacing } from '../../theme';
import {
  buildFailureReceipt,
  buildPendingReceipt,
  buildSuccessReceipt,
  matchesWalletTransaction,
  type ShopReceiptState,
} from '../shop/shopReceipts';
import { readEarnSnapshot } from './earnState';
import {
  AdWallCard,
  EarnHeader,
  EarnInfoBanner,
  EarnSectionBadge,
  EarnSectionHeader,
  RewardStreakCard,
} from './components';

const IDLE_RECEIPT: ShopReceiptState = {
  status: 'idle',
  kind: null,
  title: '',
  message: '',
};

const STREAK_CLAIM_DELAY_MS = 1_500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatWalletBalanceLabel(value: number, isReady: boolean): string {
  if (!isReady) {
    return '...';
  }
  return Math.max(0, Math.floor(value)).toString();
}

function formatReceiptBalances(balanceAfter?: ShopReceiptState['balanceAfter']): string | null {
  if (!balanceAfter) {
    return null;
  }

  return `Balance now: ${balanceAfter.gems} Gems, ${balanceAfter.cash} Cash, ${balanceAfter.fuel} Fuel`;
}

function EarnReceiptCard({
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

export function EarnScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { userId, isLoaded: isAuthLoaded, isSignedIn, getToken } = useSessionAuth();
  const { gems, cash, walletHydrated, walletStateAvailable } = useWallet();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [accountState, setAccountState] = useState<Record<string, unknown> | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<ShopReceiptState>(IDLE_RECEIPT);
  const [claimingAdWall, setClaimingAdWall] = useState(false);
  const [claimingStreakIndex, setClaimingStreakIndex] = useState<number | null>(null);

  const handleBack = useCallback(() => router.back(), [router]);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isAppActive, isFocused]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }

    requestBackendRefresh({ scopes: ['wallet'] });
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }
    return subscribeBootstrap();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !userId) {
      return;
    }

    const unsubscribeSpacetime = subscribeSpacetimeDataChanges((event) => {
      if (shouldRefreshWalletFromSpacetimeEvent(event, walletHydrated)) {
        setRefreshNonce((value) => value + 1);
      }
    });
    const unsubscribeBackend = subscribeBackendRefresh((event) => {
      if (shouldRefreshWalletFromBackendEvent(event, walletHydrated)) {
        setRefreshNonce((value) => value + 1);
      }
    });

    return () => {
      unsubscribeSpacetime();
      unsubscribeBackend();
    };
  }, [isAuthLoaded, isSignedIn, userId, walletHydrated]);

  useEffect(() => {
    let active = true;

    if (!isAuthLoaded) {
      return () => {
        active = false;
      };
    }

    if (!isSignedIn || !userId) {
      setAccountState(null);
      setReceipt(IDLE_RECEIPT);
      return () => {
        active = false;
      };
    }

    if (!queriesEnabled) {
      return () => {
        active = false;
      };
    }

    void (async () => {
      const nextState = await fetchAccountState(null, getToken, userId);
      if (!active) {
        return;
      }

      setAccountState(nextState ?? {});
    })();

    return () => {
      active = false;
    };
  }, [getToken, isAuthLoaded, isSignedIn, queriesEnabled, refreshNonce, userId]);

  const earnSnapshot = useMemo(
    () => readEarnSnapshot(accountState ?? {}, nowMs),
    [accountState, nowMs],
  );
  const walletReady = walletHydrated && walletStateAvailable;
  const isInitialLoading = queriesEnabled && accountState === null;
  const isActionPending = receipt.status === 'pending' || claimingAdWall || claimingStreakIndex !== null;

  const dismissReceipt = useCallback(() => {
    setReceipt(IDLE_RECEIPT);
  }, []);

  const refreshEarnState = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  const runRewardAction = useCallback(
    async (params: {
      pendingTitle: string;
      pendingMessage: string;
      failureMessage: string;
      successToast: string;
      eventType: string;
      source: string;
      deltaGems: number;
      mutate: () => Promise<{ ok: boolean; message?: string }>;
    }) => {
      const actionStartedAtMs = Date.now();
      setReceipt(
        buildPendingReceipt('claim_reward', params.pendingTitle, params.pendingMessage),
      );

      const result = await params.mutate();
      if (!result.ok) {
        const failureMessage = result.message ?? params.failureMessage;
        setReceipt(buildFailureReceipt('claim_reward', failureMessage));
        toast.error(failureMessage);
        refreshEarnState();
        return;
      }

      const transaction = await waitForWalletTransaction((row) =>
        matchesWalletTransaction(row, {
          eventType: params.eventType,
          source: params.source,
          deltaGems: params.deltaGems,
          createdAfterMs: actionStartedAtMs,
        }),
      );

      if (transaction) {
        setReceipt(buildSuccessReceipt('claim_reward', transaction));
        toast.success(params.successToast);
        refreshEarnState();
        return;
      }

      const balance = fetchMyWalletBalance();
      setReceipt({
        status: 'success',
        kind: 'claim_reward',
        title: 'Reward claimed',
        message: 'The server recorded your reward and refreshed your wallet.',
        balanceAfter: balance
          ? {
              gems: balance.gems,
              cash: balance.cash,
              fuel: balance.fuel,
            }
          : undefined,
      });
      toast.success(params.successToast);
      refreshEarnState();
    },
    [refreshEarnState],
  );

  const handleClaimAdWall = useCallback(async () => {
    if (!userId || isActionPending || !earnSnapshot.adWall.canClaim) {
      return;
    }

    setClaimingAdWall(true);
    try {
      await runRewardAction({
        pendingTitle: 'Claiming reward',
        pendingMessage: 'Waiting for the server to record your ad task reward.',
        failureMessage: 'Could not claim the ad task reward right now.',
        successToast: `You earned ${earnSnapshot.adWall.rewardGems} gems.`,
        eventType: 'claim_earn_ad_reward',
        source: 'earn_ad_wall',
        deltaGems: earnSnapshot.adWall.rewardGems,
        mutate: () => claimEarnAdWallReward(userId, 'earn_ad_wall'),
      });
    } finally {
      setClaimingAdWall(false);
    }
  }, [
    earnSnapshot.adWall.canClaim,
    earnSnapshot.adWall.rewardGems,
    isActionPending,
    runRewardAction,
    userId,
  ]);

  const handleClaimStreakReward = useCallback(
    async (rewardIndex: number) => {
      if (
        !userId ||
        isActionPending ||
        earnSnapshot.streak.nextRewardIndex === null ||
        rewardIndex !== earnSnapshot.streak.nextRewardIndex
      ) {
        return;
      }

      const rewardAmount = earnSnapshot.streak.rewards[rewardIndex]?.amount ?? 0;
      setClaimingStreakIndex(rewardIndex);
      try {
        await delay(STREAK_CLAIM_DELAY_MS);
        await runRewardAction({
          pendingTitle: 'Claiming streak reward',
          pendingMessage: 'Waiting for the server to lock and record your streak claim.',
          failureMessage: 'Could not claim the streak reward right now.',
          successToast: `You earned ${rewardAmount} gems.`,
          eventType: 'claim_earn_streak_reward',
          source: 'earn_streak',
          deltaGems: rewardAmount,
          mutate: () => claimEarnStreakReward(userId, rewardIndex, 'earn_streak'),
        });
      } finally {
        setClaimingStreakIndex(null);
      }
    },
    [
      earnSnapshot.streak.nextRewardIndex,
      earnSnapshot.streak.rewards,
      isActionPending,
      runRewardAction,
      userId,
    ],
  );

  return (
    <AppScreen noPadding edges={[]} style={styles.container}>
      <EarnHeader
        gemsLabel={formatWalletBalanceLabel(gems, walletReady)}
        cashLabel={formatWalletBalanceLabel(cash, walletReady)}
        onBack={handleBack}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <EarnInfoBanner message="Rewards are server-backed. Claims persist across reloads and reconnects." />

        {receipt.status !== 'idle' ? (
          <EarnReceiptCard receipt={receipt} onDismiss={dismissReceipt} />
        ) : null}

        {!isAuthLoaded || isInitialLoading ? (
          <SectionCard title="Loading rewards" style={styles.stateCard}>
            <View style={styles.stateRow}>
              <ActivityIndicator size="small" color={colors.accentPremium} />
              <AppText variant="small" secondary>
                Syncing your wallet and claim state from the server.
              </AppText>
            </View>
          </SectionCard>
        ) : !isSignedIn ? (
          <SectionCard title="Sign in required" style={styles.stateCard}>
            <AppText variant="small" secondary>
              Sign in to load reward tasks and claim streak progress.
            </AppText>
          </SectionCard>
        ) : (
          <>
            <View style={styles.section}>
              <EarnSectionHeader
                title="Tasks"
                subtitle="Claim a server-recorded reward when the timer is ready."
              />
              <AdWallCard
                rewardGems={earnSnapshot.adWall.rewardGems}
                claimCount={earnSnapshot.adWall.claimCount}
                canClaim={earnSnapshot.adWall.canClaim}
                remainingMs={earnSnapshot.adWall.remainingMs}
                loading={claimingAdWall}
                disabled={isActionPending}
                onClaim={handleClaimAdWall}
              />
            </View>

            <View style={styles.section}>
              <EarnSectionHeader
                title="Watching Streak"
                subtitle="Rewards unlock in order and persist until the daily reset."
                badge={<EarnSectionBadge />}
              />
              <RewardStreakCard
                rewards={earnSnapshot.streak.rewards}
                claimedCount={earnSnapshot.streak.claimedCount}
                nextRewardAmount={earnSnapshot.streak.nextRewardAmount}
                cycleExpiresAtMs={earnSnapshot.streak.cycleExpiresAtMs}
                remainingMs={earnSnapshot.streak.remainingMs}
                loadingIndex={claimingStreakIndex}
                disabled={isActionPending}
                onClaim={handleClaimStreakReward}
              />
            </View>

            <SectionCard
              title="Claim policy"
              subtitle="Server authority and deterministic recovery"
              style={styles.policyCard}
            >
              <View style={styles.policyList}>
                <AppText variant="small" secondary>
                  Rewards are written through wallet reducers and ledger rows only.
                </AppText>
                <AppText variant="small" secondary>
                  Streak order and ad-task cooldown are stored in account state, so reloads keep the same claim status.
                </AppText>
                <AppText variant="small" secondary>
                  If a claim is already recorded, duplicate taps will fail instead of crediting again.
                </AppText>
              </View>
              <AppButton
                title="Refresh rewards"
                variant="outline"
                size="small"
                onPress={refreshEarnState}
                disabled={isActionPending}
              />
            </SectionCard>
          </>
        )}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.screenBottom,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  stateCard: {
    backgroundColor: colors.surfaceAlt,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  policyCard: {
    backgroundColor: colors.surfaceAlt,
  },
  policyList: {
    gap: spacing.sm,
  },
});
