import { ReactNode } from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '../theme';

type AppTextProps = TextProps & {
  children: ReactNode;
  variant?: TypographyVariant;
  muted?: boolean;
  secondary?: boolean;
};

export function AppText({
  children,
  variant = 'body',
  muted,
  secondary,
  style,
  ...rest
}: AppTextProps) {
  const color = muted
    ? colors.textMuted
    : secondary
      ? colors.textSecondary
      : colors.textPrimary;

  return (
    <Text style={[styles.base, typography[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});




