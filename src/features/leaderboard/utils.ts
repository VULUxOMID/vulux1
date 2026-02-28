import { colors } from '../../theme';

export const getRankColor = (rank: number) => {
  switch (rank) {
    case 1:
      return colors.accentRankGold;
    case 2:
      return colors.accentRankSilver;
    case 3:
      return colors.accentRankBronze;
    default:
      return colors.surfaceAlt;
  }
};

export const getRankTextColor = (rank: number) =>
  rank <= 3 ? colors.textOnLight : colors.textPrimary;

export const formatCash = (amount: number) =>
  amount >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${amount}`;
