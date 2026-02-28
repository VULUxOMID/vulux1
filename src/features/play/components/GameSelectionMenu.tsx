import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type GameConfig = {
  id: string;
  name: string;
  subtitle: string;
  colors: readonly [string, string];
  icon: keyof typeof Ionicons.glyphMap;
};

const GAMES: GameConfig[] = [
  {
    id: 'slots',
    name: 'SLOTS',
    subtitle: 'CHAOS CREW',
    colors: [colors.playNeonGreen, colors.playSurfaceDeep],
    icon: 'flash',
  },
  {
    id: 'mines',
    name: 'MINES',
    subtitle: 'STAKE ORIGINALS',
    colors: [colors.playGameCardMinesStart, colors.playGameCardMinesEnd],
    icon: 'diamond',
  },
  {
    id: 'dice',
    name: 'DICE',
    subtitle: 'STAKE ORIGINALS',
    colors: [colors.playGameCardDiceStart, colors.playGameCardDiceEnd],
    icon: 'dice',
  },
  {
    id: 'plinko',
    name: 'PLINKO',
    subtitle: 'STAKE ORIGINALS',
    colors: [colors.playNeonPink, colors.playGameCardPlinkoEnd],
    icon: 'ellipse',
  },
  {
    id: 'hilo',
    name: 'HILO',
    subtitle: 'STAKE ORIGINALS',
    colors: [colors.playGameCardHiloStart, colors.playGameCardHiloEnd],
    icon: 'trending-up',
  },
  {
    id: 'dragon',
    name: 'DRAGON',
    subtitle: 'TOWER',
    colors: [colors.playGameCardDragonStart, colors.playGameCardDragonEnd],
    icon: 'flame',
  },
];

type GameSelectionMenuProps = {
  onSelectGame: (id: string) => void;
  gamePlayers?: Record<string, number>;
};

export const GameSelectionMenu = React.memo(function GameSelectionMenu({
  onSelectGame,
  gamePlayers,
}: GameSelectionMenuProps) {
  return (
    <View style={styles.menuGrid}>
      {GAMES.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          players={gamePlayers?.[game.id] ?? 0}
          onPress={() => onSelectGame(game.id)}
        />
      ))}
    </View>
  );
});

type GameCardProps = {
  game: GameConfig;
  players: number;
  onPress: () => void;
};

const GameCard = React.memo(function GameCard({ game, players, onPress }: GameCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.gameCardItem, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
      onPress={onPress}
    >
      <LinearGradient
        colors={game.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gameCardGradient}
      >
        <View style={styles.gameCardContent}>
          <View style={styles.gameIconContainer}>
            <Ionicons name={game.icon} size={48} color={colors.textOnDarkStrong} />
          </View>

          <View>
            <AppText style={styles.gameCardTitle}>{game.name}</AppText>
            <AppText style={styles.gameCardSubtitle}>{game.subtitle}</AppText>
          </View>
        </View>

        {players > 0 ? (
          <View style={styles.playerCountBadge}>
            <View style={styles.greenDot} />
            <AppText style={styles.playerCountText}>
              {players.toLocaleString()} playing
            </AppText>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  menuGrid: {
    gap: spacing.md,
  },
  gameCardItem: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.playCardBorder,
  },
  gameCardGradient: {
    padding: spacing.lg,
  },
  gameCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gameIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.overlayDarkSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textOnDark,
  },
  gameCardSubtitle: {
    fontSize: 13,
    color: colors.textOnDarkMuted,
    marginTop: 2,
  },
  playerCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.playNeonGreen,
  },
  playerCountText: {
    fontSize: 11,
    color: colors.playNeonGreen,
  },
});
