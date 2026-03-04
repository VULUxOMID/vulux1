import React, { useMemo } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Polyline, Svg } from 'react-native-svg';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

export type OverlayType = 'none' | 'big_win' | 'bonus_start' | 'bonus_end';

export type OverlayState = {
  type: OverlayType;
  message: string;
  amount?: number;
};

export type SlotIcon = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  weight: number;
  multiplier: number;
};

export type SlotIconMap = Record<string, SlotIcon>;
export type Payline = number[];

type GameOverlayProps = {
  state: OverlayState;
  onClose: () => void;
};

type PaytableModalProps = {
  visible: boolean;
  onClose: () => void;
  slotIcons: SlotIconMap;
  paylines: Payline[];
  bonusFreeSpins: number;
  buyBonusMultiplier: number;
};

export const GameOverlay = React.memo(function GameOverlay({ state, onClose }: GameOverlayProps) {
  if (state.type === 'none') return null;

  const title = state.type === 'big_win' ? 'BIG WIN!' : state.type === 'bonus_start' ? 'CHAOS BONUS' : 'BONUS COMPLETE';
  const buttonLabel = state.type === 'bonus_start' ? "LET'S GO" : 'CONTINUE';

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlayContainer]}>
      <View style={styles.overlayContent}>
        <AppText variant="h1" style={styles.overlayTitle}>
          {title}
        </AppText>

        {state.amount !== undefined && (
          <AppText variant="h1" style={styles.overlayAmount}>
            +{state.amount}
          </AppText>
        )}

        <AppText variant="bodyBold" secondary style={styles.overlayMessage}>
          {state.message}
        </AppText>

        <Pressable onPress={onClose} style={styles.overlayButton}>
          <AppText variant="bodyLarge" style={styles.overlayButtonText}>
            {buttonLabel}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
});

export const PaytableModal = React.memo(function PaytableModal({
  visible,
  onClose,
  slotIcons,
  paylines,
  bonusFreeSpins,
  buyBonusMultiplier,
}: PaytableModalProps) {
  const sortedIcons = useMemo(
    () => Object.entries(slotIcons).sort(([, a], [, b]) => b.multiplier - a.multiplier),
    [slotIcons]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.paytableContainer}>
          <LinearGradient
            colors={[colors.playSurfaceHighlight, colors.playSurfaceMid, colors.playSurfaceShadow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.paytableHeader}
          >
            <AppText variant="bodyLarge" style={styles.paytableTitle}>
              GAME INFO & PAYTABLE
            </AppText>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10}>
              <Ionicons name="close-circle" size={28} color={colors.playNeonGreen} />
            </Pressable>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.paytableContent} showsVerticalScrollIndicator={false}>
            <AppText variant="smallBold" style={styles.paytableSectionTitle}>
              SYMBOLS & PAYOUTS
            </AppText>
            <AppText variant="tiny" muted style={styles.paytableSectionSubtitle}>
              (Multiplier x Bet Per Line)
            </AppText>

            <View style={styles.symbolGrid}>
              {sortedIcons.map(([key, data]) => (
                <View key={key} style={styles.symbolRow}>
                  <View style={styles.symbolIconCasing}>
                    <Ionicons name={data.icon} size={28} color={data.color} />
                  </View>
                  <View style={styles.payoutInfo}>
                    <AppText variant="micro" secondary style={styles.symbolName}>
                      {key.toUpperCase()}
                    </AppText>
                    <AppText variant="smallBold" style={styles.multiplierText}>
                      {data.multiplier}x
                    </AppText>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <AppText variant="smallBold" style={styles.paytableSectionTitle}>
              WINNING PAYLINES
            </AppText>
            <AppText variant="tiny" muted style={styles.paytableSectionSubtitle}>
              9 patterns paying left-to-right
            </AppText>

            <View style={styles.paylinePreviewContainer}>
              <Svg height={100} width={200} viewBox="0 0 200 100">
                {paylines.map((line, index) => {
                  const points = line
                    .map((row, col) => {
                      const x = 20 + col * 40;
                      const y = 20 + row * 30;
                      return `${x},${y}`;
                    })
                    .join(' ');

                  return (
                    <Polyline
                      key={index}
                      points={points}
                      stroke={index === 0 ? colors.playNeonGreen : colors.textOnDarkDim}
                      strokeWidth={index === 0 ? 3 : 1.5}
                      fill="none"
                    />
                  );
                })}
              </Svg>
              <AppText variant="micro" muted style={styles.paylineNote}>
                Highest win paid per line.
              </AppText>
            </View>

            <View style={styles.divider} />

            <AppText variant="smallBold" style={styles.paytableSectionTitle}>
              CHAOS FREE SPINS
            </AppText>
            <View style={styles.bonusInfoBox}>
              <Ionicons name="flash" size={24} color={colors.accentWarning} style={styles.bonusIcon} />
              <AppText variant="small" secondary style={styles.bonusDesc}>
                Trigger the bonus to get {bonusFreeSpins} Free Spins!
                {'\n'}Free spins use your current bet but cost $0.
                {'\n'}Buy instantly for {buyBonusMultiplier}x total bet.
              </AppText>
            </View>

            <Pressable onPress={onClose} style={styles.paytableOkButton}>
              <AppText variant="bodyBold" style={styles.paytableOkText}>
                UNDERSTOOD
              </AppText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlayContainer: {
    backgroundColor: colors.overlayDarkHeavy,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  overlayContent: {
    backgroundColor: colors.playSurfaceRaised,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.playNeonGreen,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: `0px 0px 30px ${colors.playNeonGreen}` }
      : {
          shadowColor: colors.playNeonGreen,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 30,
        }),
    width: '100%',
    maxWidth: 320,
  },
  overlayTitle: {
    color: colors.textOnDark,
    textAlign: 'center',
    marginBottom: spacing.md,
    ...(Platform.OS === 'web'
      ? { textShadow: `0px 0px 10px ${colors.playNeonPink}` }
      : {
          textShadowColor: colors.playNeonPink,
          textShadowRadius: 10,
        }),
  },
  overlayAmount: {
    color: colors.playNeonGreen,
    marginBottom: spacing.sm,
    ...(Platform.OS === 'web'
      ? { textShadow: `0px 0px 20px ${colors.playNeonGreen}` }
      : {
          textShadowColor: colors.playNeonGreen,
          textShadowRadius: 20,
        }),
  },
  overlayMessage: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  overlayButton: {
    backgroundColor: colors.playNeonGreen,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.full,
    ...(Platform.OS === 'web'
      ? { boxShadow: `0px 0px 15px ${colors.playNeonGreen}` }
      : {
          shadowColor: colors.playNeonGreen,
          shadowOpacity: 0.5,
          shadowRadius: 15,
        }),
  },
  overlayButtonText: {
    color: colors.textOnLight,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayDarkSolid,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  paytableContainer: {
    backgroundColor: colors.playSurfaceRaised,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.playCardBorder,
    overflow: 'hidden',
  },
  paytableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.playCardBorder,
  },
  paytableTitle: {
    color: colors.textOnDark,
    letterSpacing: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  paytableContent: {
    padding: spacing.md,
  },
  paytableSectionTitle: {
    color: colors.playNeonGreen,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  paytableSectionSubtitle: {
    marginBottom: spacing.md,
  },
  symbolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  symbolRow: {
    width: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.playSurfaceMid,
    padding: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  payoutInfo: {
    flex: 1,
  },
  symbolName: {
    textTransform: 'uppercase',
  },
  multiplierText: {
    color: colors.textOnDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.playCardBorder,
    marginVertical: spacing.md,
  },
  paylinePreviewContainer: {
    alignItems: 'center',
    backgroundColor: colors.playSurfaceBlack,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  paylineNote: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  bonusInfoBox: {
    backgroundColor: colors.playSurfaceMid,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.playCardBorder,
    alignItems: 'center',
  },
  bonusIcon: {
    marginBottom: spacing.sm,
  },
  bonusDesc: {
    textAlign: 'center',
  },
  paytableOkButton: {
    backgroundColor: colors.playNeonGreen,
    paddingVertical: spacing.mdPlus,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    ...(Platform.OS === 'web'
      ? { boxShadow: `0px 0px 10px ${colors.playNeonGreen}` }
      : {
          shadowColor: colors.playNeonGreen,
          shadowOpacity: 0.3,
          shadowRadius: 10,
        }),
  },
  paytableOkText: {
    color: colors.textOnLight,
    letterSpacing: 1,
  },
  symbolIconCasing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.playCardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.playSurfaceHighlight,
  },
});
