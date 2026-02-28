import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

export type ToggleRowOption = {
  key: string;
  label?: string;
  renderIcon?: (isActive: boolean) => ReactNode;
  accessibilityLabel?: string;
};

type ToggleRowProps = {
  options: ToggleRowOption[];
  value: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function ToggleRow({ options, value, onChange, style }: ToggleRowProps) {
  return (
    <View style={[styles.container, style]}>
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.option, isActive && styles.optionActive]}
            accessibilityRole="button"
            accessibilityLabel={
              option.accessibilityLabel ?? option.label ?? option.key
            }
            accessibilityState={{ selected: isActive }}
          >
            <View style={styles.optionContent}>
              {option.renderIcon ? option.renderIcon(isActive) : null}
              {option.label ? (
                <AppText
                  variant="tiny"
                  style={[styles.label, isActive && styles.labelActive]}
                >
                  {option.label}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    padding: spacing.xxs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  option: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  optionActive: {
    backgroundColor: colors.surface,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.textPrimary,
  },
});
