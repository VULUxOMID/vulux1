import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Polyline, Svg } from 'react-native-svg';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type SlotsHeaderProps = {
  onBack: () => void;
  onOpenPaytable: () => void;
  onReset: () => void;
  history: number[];
  sessionWinLoss: number;
  showGraph: boolean;
};

type SlotsControlsProps = {
  betPerLine: number;
  lines: number;
  spinning: boolean;
  onDecreaseBet: () => void;
  onIncreaseBet: () => void;
  onDecreaseLines: () => void;
  onIncreaseLines: () => void;
  onSpin: () => void;
};

const WinLossGraph = React.memo(function WinLossGraph({ history }: { history: number[] }) {
  const width = 60;
  const height = 20;
  const padding = spacing.xxs;

  if (history.length < 2) return null;

  const max = Math.max(...history, 50);
  const min = Math.min(...history, -50);
  const range = max - min || 1;
  const strokeColor = history[history.length - 1] >= 0 ? colors.playNeonGreen : colors.playNeonPink;

  const points = history
    .map((value, index) => {
      const x = (index / (history.length - 1)) * (width - padding * 2) + padding;
      const y = height - ((value - min) / range) * (height - padding * 2) - padding;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={styles.sparklineContainer}>
      <Svg width={width} height={height}>
        <Polyline points={points} fill="none" stroke={strokeColor} strokeWidth="2" strokeOpacity={0.9} />
      </Svg>
    </View>
  );
});

export const SlotsHeader = React.memo(function SlotsHeader({
  onBack,
  onOpenPaytable,
  onReset,
  history,
  sessionWinLoss,
  showGraph,
}: SlotsHeaderProps) {
  const badgeColor = sessionWinLoss >= 0 ? colors.playNeonGreen : colors.playNeonPink;

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.iconButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={onOpenPaytable} style={styles.iconButton} hitSlop={10}>
          <Ionicons name="information-circle-outline" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={styles.titleContainer}>
          <AppText variant="bodyBold" style={styles.titleMain}>
            CHAOS
          </AppText>
          <AppText variant="micro" style={styles.titleSub}>
            SLOTS
          </AppText>
        </View>
        {showGraph && (
          <View style={styles.graphWrapper}>
            <WinLossGraph history={history} />
            <Pressable onPress={onReset} style={styles.resetButton} hitSlop={10}>
              <Ionicons name="refresh" size={12} color={colors.textOnDarkFaint} />
            </Pressable>
          </View>
        )}
        <View style={[styles.chaosBadge, { borderColor: badgeColor }]}>
          <AppText variant="tinyBold" style={[styles.chaosBadgeText, { color: badgeColor }]}>
            {sessionWinLoss >= 0 ? '+' : ''}
            {sessionWinLoss}
          </AppText>
        </View>
      </View>
    </View>
  );
});

export const SlotsControls = React.memo(function SlotsControls({
  betPerLine,
  lines,
  spinning,
  onDecreaseBet,
  onIncreaseBet,
  onDecreaseLines,
  onIncreaseLines,
  onSpin,
}: SlotsControlsProps) {
  return (
    <View style={styles.controlsContainer}>
      <View style={styles.controlGroup}>
        <Pressable onPress={onDecreaseBet} style={styles.controlButton}>
          <AppText variant="smallBold" style={styles.controlButtonText}>
            -
          </AppText>
        </Pressable>
        <View style={styles.controlDisplay}>
          <AppText variant="tiny" secondary>
            BET
          </AppText>
          <AppText variant="smallBold" style={styles.controlValue}>
            {betPerLine}
          </AppText>
        </View>
        <Pressable onPress={onIncreaseBet} style={styles.controlButton}>
          <AppText variant="smallBold" style={styles.controlButtonText}>
            +
          </AppText>
        </Pressable>
      </View>

      <Pressable
        style={[styles.spinButton, spinning && styles.spinButtonDisabled]}
        onPress={onSpin}
        disabled={spinning}
      >
        {spinning ? (
          <ActivityIndicator color={colors.textOnLight} />
        ) : (
          <AppText variant="smallBold" style={styles.spinButtonText}>
            SPIN
          </AppText>
        )}
      </Pressable>

      <View style={styles.controlGroup}>
        <Pressable onPress={onDecreaseLines} style={styles.controlButton}>
          <AppText variant="smallBold" style={styles.controlButtonText}>
            -
          </AppText>
        </Pressable>
        <View style={styles.controlDisplay}>
          <AppText variant="tiny" secondary>
            LINES
          </AppText>
          <AppText variant="smallBold" style={styles.controlValue}>
            {lines}
          </AppText>
        </View>
        <Pressable onPress={onIncreaseLines} style={styles.controlButton}>
          <AppText variant="smallBold" style={styles.controlButtonText}>
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xxs,
    minHeight: 44,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconButton: {
    padding: spacing.xs,
  },
  titleContainer: {
    flex: 1,
    minWidth: 60,
  },
  titleMain: {
    color: colors.textOnDark,
    letterSpacing: 1,
  },
  titleSub: {
    color: colors.textMuted,
    letterSpacing: 1,
  },
  graphWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.xs,
  },
  resetButton: {
    padding: spacing.xxs,
    opacity: 0.5,
  },
  chaosBadge: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.smMinus,
    paddingVertical: spacing.xsMinus,
    borderRadius: radius.smMinus,
    borderWidth: 1,
    minWidth: 40,
    maxWidth: 60,
    alignItems: 'center',
  },
  chaosBadgeText: {
    letterSpacing: 0.3,
  },
  sparklineContainer: {
    height: 20,
    justifyContent: 'center',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.xs,
    gap: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.playSurfaceRaised,
    borderRadius: radius.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  controlButton: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: colors.playCardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    color: colors.textOnDark,
  },
  controlDisplay: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  controlValue: {
    color: colors.textOnDark,
  },
  spinButton: {
    flex: 1,
    backgroundColor: colors.playNeonGreen,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.playNeonGreen,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  spinButtonDisabled: {
    backgroundColor: colors.playSurfaceDisabled,
    shadowOpacity: 0,
  },
  spinButtonText: {
    color: colors.textOnLight,
    letterSpacing: 1,
  },
});
