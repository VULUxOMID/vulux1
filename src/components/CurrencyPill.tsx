import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { CashIcon } from './CashIcon';

export type CurrencyPillProps = {
  icon: keyof typeof Ionicons.glyphMap | 'cash';
  label: string;
  color: string;
  onPress?: () => void;
  showDot?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'regular' | 'small';
};

export function CurrencyPill({
  icon,
  label,
  color,
  onPress,
  showDot = false,
  style,
  size = 'regular',
}: CurrencyPillProps) {
  const isSmall = size === 'small';
  const iconSize = isSmall ? 16 : 18;
  const textVariant = isSmall ? 'tiny' : 'small';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.container, isSmall && styles.containerSmall, style]}
    >
      {icon === 'cash' ? (
        <CashIcon size={iconSize} color={color} />
      ) : (
        <Ionicons name={icon} size={iconSize} color={color} />
      )}
      <AppText variant={textVariant} style={styles.label}>
        {label}
      </AppText>
      {showDot ? (
        <Pressable
          style={[styles.dot, isSmall && styles.dotSmall]}
          pointerEvents="none"
        />
      ) : null}
    </Pressable>
  );
}

export function CurrencyChip(props: Omit<CurrencyPillProps, 'size'>) {
  return <CurrencyPill {...props} size="small" />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  containerSmall: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.lg,
  },
  label: {
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    top: -spacing.xxs,
    right: -spacing.xxs,
    width: spacing.sm + spacing.xxs,
    height: spacing.sm + spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: colors.accentDanger,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  dotSmall: {
    width: spacing.sm,
    height: spacing.sm,
  },
});
