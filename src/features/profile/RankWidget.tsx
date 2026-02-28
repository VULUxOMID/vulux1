import React from 'react';
import { StyleSheet, View, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';

type RankWidgetProps = {
  rank: number;
  trend: 'up' | 'down' | 'neutral';
  trendValue: number;
  isPublic: boolean;
  onTogglePrivacy: (value: boolean) => void;
};

export function RankWidget({ 
  rank, 
  trend, 
  trendValue,
  isPublic,
  onTogglePrivacy 
}: RankWidgetProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="trophy" size={20} color={colors.accentCash} />
          <AppText variant="h3">Leaderboard Rank</AppText>
        </View>
        
        <View style={styles.privacyToggle}>
          <Ionicons 
            name={isPublic ? "eye" : "eye-off"} 
            size={14} 
            color={isPublic ? colors.textSecondary : colors.textMuted} 
          />
          <Switch
            value={isPublic}
            onValueChange={(val) => {
              hapticTap();
              onTogglePrivacy(val);
            }}
            trackColor={{ false: colors.surfaceAlt, true: colors.accentPrimary }}
            thumbColor={colors.textOnDark}
            ios_backgroundColor={colors.surfaceAlt}
            style={{ transform: [{ scale: 0.7 }] }}
          />
        </View>
      </View>

      <View style={styles.content}>
        <AppText variant="micro" secondary style={styles.label}>GLOBAL RANK</AppText>
        <View style={styles.rankValueRow}>
          <AppText variant="h1" style={styles.rankValue}>#{rank}</AppText>
          <View
            style={[
              styles.trendBadge,
              {
                backgroundColor:
                  trend === 'up'
                    ? colors.overlayAccentSuccessSubtle
                    : trend === 'down'
                      ? colors.overlayAccentDangerSubtle
                      : colors.surfaceAlt,
              },
            ]}
          >
            <Ionicons
              name={trend === 'up' ? 'arrow-up' : trend === 'down' ? 'arrow-down' : 'remove'}
              size={12}
              color={
                trend === 'up'
                  ? colors.accentSuccess
                  : trend === 'down'
                    ? colors.accentDanger
                    : colors.textMuted
              }
            />
            <AppText
              variant="tinyBold"
              style={{
                color:
                  trend === 'up'
                    ? colors.accentSuccess
                    : trend === 'down'
                      ? colors.accentDanger
                      : colors.textMuted,
              }}
            >
              {trendValue}
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  content: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  label: {
    marginBottom: spacing.xs,
  },
  rankValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rankValue: {
    color: colors.textPrimary,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.smMinus,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    gap: spacing.xxs,
  },
});
