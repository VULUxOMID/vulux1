import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type SlotsStatusProps = {
  jackpot: number;
  historyLength: number;
  spinning: boolean;
  winningLinesCount: number;
  children: React.ReactNode;
};

export const SlotsStatus = React.memo(function SlotsStatus({
  jackpot,
  historyLength,
  spinning,
  winningLinesCount,
  children,
}: SlotsStatusProps) {
  const meterWidth = useMemo(
    () => Math.min(100, (historyLength % 20) * 5 + 20),
    [historyLength]
  );

  const statusText = useMemo(() => {
    if (spinning) {
      return 'RIDING THE CHAOS...';
    }

    if (winningLinesCount > 0) {
      return `CHAOS PAYS! ${winningLinesCount} LINES WON`;
    }

    return 'CHAOS ENERGY BUILDING...';
  }, [spinning, winningLinesCount]);

  return (
    <>
      <View style={styles.jackpotContainer}>
        <AppText variant="micro" style={styles.jackpotLabel}>
          GRAND CHAOS JACKPOT
        </AppText>
        <AppText variant="bodyLarge" style={styles.jackpotValue}>
          ${jackpot.toLocaleString()}
        </AppText>
      </View>

      {children}

      <View style={styles.chaosStatusBar}>
        <View style={styles.chaosMeterContainer}>
          <View style={[styles.chaosMeterFill, { width: `${meterWidth}%` }]} />
        </View>
        <AppText variant="micro" style={styles.chaosStatusText}>
          {statusText}
        </AppText>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  jackpotContainer: {
    width: '85%',
    alignItems: 'center',
    marginBottom: -spacing.md,
    borderTopLeftRadius: radius.lgMinus,
    borderTopRightRadius: radius.lgMinus,
    borderWidth: 2,
    borderColor: colors.playCardBorder,
    borderBottomWidth: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.playSurfaceDeepest,
    zIndex: 0,
  },
  jackpotLabel: {
    color: colors.playNeonPink,
    letterSpacing: 2,
    marginBottom: spacing.xxs,
    textShadowColor: colors.playNeonPink,
    textShadowRadius: 8,
  },
  jackpotValue: {
    color: colors.textOnDark,
    textShadowColor: colors.playNeonGreen,
    textShadowRadius: 12,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  chaosStatusBar: {
    width: '85%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.smMinus,
    backgroundColor: colors.playSurfaceDeepest,
    borderBottomLeftRadius: radius.lgMinus,
    borderBottomRightRadius: radius.lgMinus,
    borderWidth: 2,
    borderColor: colors.playCardBorder,
    borderTopWidth: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  chaosMeterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlayDarkMedium,
    zIndex: 0,
  },
  chaosMeterFill: {
    height: '100%',
    backgroundColor: colors.playNeonGreenSubtle,
    borderBottomLeftRadius: radius.lgMinus,
    borderBottomRightRadius: radius.lgMinus,
    shadowColor: colors.playNeonGreen,
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  chaosStatusText: {
    color: colors.playNeonGreen,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textShadowColor: colors.playNeonGreen,
    textShadowRadius: 4,
    zIndex: 1,
  },
});
