import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText, CashIcon } from '../../../components';
import { colors, spacing } from '../../../theme';

type PlayHeaderProps = {
  topInset: number;
  gems: number;
  cash: number;
  streak: number;
  canClaimDaily: boolean;
  onClaimDaily: () => void;
  onPressEarn: () => void;
  showStats: boolean;
};

export const PlayHeader = React.memo(function PlayHeader({
  topInset,
  gems,
  cash,
  streak,
  canClaimDaily,
  onClaimDaily,
  onPressEarn,
  showStats,
}: PlayHeaderProps) {
  return (
    <View style={[styles.stickyHeader, { paddingTop: topInset + spacing.sm }]}>
      <View style={styles.headerTopRow}>
        <AppText variant="h1">Play</AppText>

        <View style={styles.headerBalances}>
          <View style={styles.nakedBalanceItem}>
            <Ionicons name="prism" size={14} color={colors.accentPremium} />
            <AppText variant="smallBold" style={{ color: colors.accentPremium }}>
              {gems}
            </AppText>
          </View>
          <View style={styles.nakedBalanceItem}>
            <CashIcon size={14} color={colors.accentCash} />
            <AppText variant="smallBold" style={{ color: colors.accentCash }}>
              {cash}
            </AppText>
          </View>
        </View>
      </View>

      {showStats && (
        <View style={styles.headerStatsDistributed}>
          <View style={styles.headerStatCol}>
            <Ionicons name="flame" size={14} color={colors.accentWarning} />
            <AppText variant="tinyBold" style={{ color: colors.accentWarning }}>
              {streak}d Streak
            </AppText>
          </View>

          <View style={styles.headerStatCol}>
            <Pressable
              style={styles.headerStatPressable}
              onPress={canClaimDaily ? onClaimDaily : undefined}
              disabled={!canClaimDaily}
              hitSlop={15}
            >
              <Ionicons
                name={canClaimDaily ? 'gift' : 'calendar-outline'}
                size={14}
                color={canClaimDaily ? colors.accentSuccess : colors.textMuted}
              />
              <AppText
                variant="tinyBold"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: canClaimDaily ? colors.accentSuccess : colors.textMuted }}
              >
                {canClaimDaily ? 'Claim Bonus' : 'Daily Reward'}
              </AppText>
            </Pressable>
          </View>

          <View style={styles.headerStatCol}>
            <Pressable style={styles.headerStatPressable} onPress={onPressEarn} hitSlop={15}>
              <Ionicons name="add-circle-outline" size={14} color={colors.textSecondary} />
              <AppText variant="tinyBold" style={{ color: colors.textSecondary }}>
                Earn Cash
              </AppText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  stickyHeader: {
    backgroundColor: colors.background,
    zIndex: 10,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 0,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerBalances: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nakedBalanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerStatsDistributed: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: spacing.xs,
  },
  headerStatCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStatPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
