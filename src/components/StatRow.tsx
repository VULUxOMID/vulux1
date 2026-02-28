import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { colors, spacing, type TypographyVariant } from '../theme';
import { AppText } from './AppText';

type StatRowProps = {
  label: string;
  value: string;
  labelVariant?: TypographyVariant;
  valueVariant?: TypographyVariant;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  divider?: boolean;
};

export function StatRow({
  label,
  value,
  labelVariant = 'small',
  valueVariant = 'small',
  labelStyle,
  valueStyle,
  style,
  divider,
}: StatRowProps) {
  return (
    <View style={[styles.row, divider && styles.rowDivider, style]}>
      <AppText variant={labelVariant} style={[styles.label, labelStyle]}>
        {label}
      </AppText>
      <AppText variant={valueVariant} style={[styles.value, valueStyle]}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
  },
  value: {
    fontWeight: '600',
  },
});
