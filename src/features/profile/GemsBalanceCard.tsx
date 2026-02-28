import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText, CashIcon } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';

type BalanceCardProps = {
  cashBalance?: number;
  gemsBalance?: number;
  fuelBalance?: number;
  rank?: number;
  isRankPublic?: boolean;
  onToggleRankPrivacy?: (value: boolean) => void;
  onPress?: () => void;
};

export function GemsBalanceCard({
  cashBalance = 0,
  gemsBalance = 0,
  fuelBalance = 0,
  rank,
  isRankPublic,
  onToggleRankPrivacy,
  onPress,
}: BalanceCardProps) {
  const formatValue = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toString();
  };

  const showRank = typeof rank === 'number' && typeof isRankPublic === 'boolean' && !!onToggleRankPrivacy;

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={[colors.surfaceAlt, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [
          styles.balancesPressable,
          pressed && styles.pressedState
        ]}>
          <View style={styles.balancesRow}>
            <View style={styles.balanceItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="prism" size={20} color={colors.accentPrimary} />
              </View>
              <AppText variant="h2" style={styles.balanceValue}>
                {formatValue(gemsBalance)}
              </AppText>
              <AppText variant="micro" secondary style={styles.label}>Gems</AppText>
            </View>

            <View style={styles.balanceItem}>
              <View style={styles.iconContainer}>
                <CashIcon size={20} color={colors.accentSuccess} />
              </View>
              <AppText variant="h2" style={styles.balanceValue}>
                {formatValue(cashBalance)}
              </AppText>
              <AppText variant="micro" secondary style={styles.label}>Cash</AppText>
            </View>

            <View style={styles.balanceItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="rocket" size={20} color={colors.accentDanger} />
              </View>
              <AppText variant="h2" style={styles.balanceValue}>{fuelBalance}m</AppText>
              <AppText variant="micro" secondary style={styles.label}>Fuel</AppText>
            </View>
          </View>
        </Pressable>

        {showRank ? (
          <>
            <View style={styles.rowDivider} />
            <View style={styles.rankRow}>
              <View style={styles.rankLeft}>
                <View style={styles.rankIconContainer}>
                  <Ionicons name="trophy" size={16} color={colors.accentRankGold} />
                </View>
                <View>
                  <AppText variant="micro" secondary style={styles.rankLabel}>GLOBAL RANK</AppText>
                  <AppText variant="bodyBold" style={[styles.rankValue, { color: colors.accentRankGold }]}>
                    #{rank}
                  </AppText>
                </View>
              </View>
              <View style={styles.rankRight}>
                <Ionicons
                  name={isRankPublic ? 'eye' : 'eye-off'}
                  size={16}
                  color={isRankPublic ? colors.textSecondary : colors.textMuted}
                />
                <Switch
                  value={isRankPublic}
                  onValueChange={(val) => {
                    hapticTap();
                    onToggleRankPrivacy?.(val);
                  }}
                  trackColor={{ false: colors.surfaceAlt, true: colors.accentPrimary }}
                  thumbColor={colors.textOnDark}
                  ios_backgroundColor={colors.surfaceAlt}
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>
            </View>
          </>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    borderRadius: radius.xl,
    backgroundColor: colors.borderSubtle,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.lg,
  },
  container: {
    flexDirection: 'column',
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  balancesPressable: {
    borderRadius: radius.lg,
    zIndex: 1,
  },
  pressedState: {
    opacity: 0.8,
  },
  balancesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  balanceValue: {
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    opacity: 0.5,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
    paddingHorizontal: spacing.sm,
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rankIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rankLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rankValue: {
    marginTop: 2,
    letterSpacing: 0.5,
  },
});
