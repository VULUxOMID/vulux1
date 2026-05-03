import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';

type StatItem = {
  value: number;
  label: string;
};

type ProfileStatsProps = {
  friends?: number;
  addedYou?: number;
  viewedYou?: number;
  onPressFriends?: () => void;
  onPressAddedYou?: () => void;
  onPressViewedYou?: () => void;
};

export function ProfileStats({
  friends = 0,
  addedYou = 0,
  viewedYou = 0,
  onPressFriends,
  onPressAddedYou,
  onPressViewedYou,
}: ProfileStatsProps) {
  const stats: StatItem[] = [
    { value: friends, label: 'Friends' },
    { value: addedYou, label: 'Friend requests' },
    { value: viewedYou, label: 'Viewed you' },
  ];
  const handlers = [onPressFriends, onPressAddedYou, onPressViewedYou];

  const formatValue = (value: number): string => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toString();
  };

  return (
    <LinearGradient
      colors={[colors.surfaceAlt, colors.surface]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      {stats.map((stat, index) => (
        <View key={stat.label} style={styles.statWrapper}>
          <Pressable
            style={({ pressed }) => [styles.statItem, pressed && styles.statItemPressed]}
            onPress={handlers[index]}
            disabled={!handlers[index]}
            accessibilityRole={handlers[index] ? 'button' : undefined}
            accessibilityLabel={handlers[index] ? `Open ${stat.label}` : undefined}
          >
            <AppText variant="h1" style={styles.value}>{formatValue(stat.value)}</AppText>
            <AppText variant="micro" secondary style={styles.label}>{stat.label}</AppText>
            {handlers[index] ? <AppText variant="micro" style={styles.hint}>Open</AppText> : null}
          </Pressable>
          {index < stats.length - 1 && <View style={styles.divider} />}
        </View>
      ))}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  statWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
    borderRadius: radius.lgMinus,
    marginHorizontal: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  statItemPressed: {
    opacity: 0.92,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  value: {
    color: colors.textPrimary,
  },
  label: {
    marginTop: spacing.xxs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  hint: {
    marginTop: spacing.xs,
    color: colors.accentPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: colors.borderSubtle,
    opacity: 0.5,
  },
});
