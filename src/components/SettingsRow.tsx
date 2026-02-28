import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type SettingsRowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  variant?: 'default' | 'destructive';
  rightElement?: ReactNode;
};

export function SettingsRow({
  label,
  value,
  onPress,
  showArrow = true,
  icon,
  iconColor,
  style,
  labelStyle,
  valueStyle,
  variant = 'default',
  rightElement,
}: SettingsRowProps) {
  const isDestructive = variant === 'destructive';
  const resolvedIconColor = iconColor ?? (isDestructive ? colors.accentDanger : colors.textSecondary);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        isDestructive && styles.destructiveContainer,
        pressed && onPress && (isDestructive ? styles.destructivePressed : styles.pressed),
        style as any,
      ]}
      disabled={!onPress}
    >
      <View style={styles.leftContent}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={resolvedIconColor}
            style={styles.icon}
          />
        )}
        <AppText
          style={[
            styles.label,
            isDestructive && styles.destructiveLabel,
            labelStyle,
          ]}
        >
          {label}
        </AppText>
      </View>

      <View style={styles.rightContent}>
        {value ? (
          <AppText style={[styles.value, valueStyle]} numberOfLines={1}>
            {value}
          </AppText>
        ) : null}
        
        {rightElement}

        {showArrow && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textMuted}
            style={styles.arrow}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: 1, // separator effect if stacked
    minHeight: 56,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  destructiveContainer: {
    backgroundColor: 'rgba(255, 94, 94, 0.08)',
  },
  destructivePressed: {
    backgroundColor: 'rgba(255, 94, 94, 0.16)',
  },
  destructiveLabel: {
    color: colors.accentDanger,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: spacing.md,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  arrow: {
    marginLeft: spacing.xs,
  },
});
