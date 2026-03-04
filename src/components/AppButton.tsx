import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'premium' | 'danger' | 'outline';

type AppButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

type ButtonPalette = {
  background: string;
  backgroundPressed: string;
  text: string;
  border: string;
  glow?: string;
};

const buttonColors: Record<ButtonVariant, ButtonPalette> = {
  primary: {
    background: colors.accentPrimary,
    backgroundPressed: colors.accentPrimarySoft,
    text: colors.textPrimary,
    border: 'transparent',
    glow: colors.accentPrimary,
  },
  secondary: {
    background: colors.surfaceAlt,
    backgroundPressed: colors.surface,
    text: colors.textSecondary,
    border: colors.borderSubtle,
  },
  premium: {
    background: colors.accentPremium,
    backgroundPressed: colors.accentPremiumSoft,
    text: colors.textPrimary,
    border: 'transparent',
    glow: colors.accentPremium,
  },
  danger: {
    background: colors.accentDanger,
    backgroundPressed: '#D95050',
    text: colors.textPrimary,
    border: 'transparent',
  },
  outline: {
    background: 'transparent',
    backgroundPressed: 'rgba(255, 255, 255, 0.05)',
    text: colors.textSecondary,
    border: colors.borderSubtle,
  },
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading,
  disabled,
  style,
  icon,
  accessibilityLabel,
}: AppButtonProps) {
  const palette = buttonColors[variant];
  const isDisabled = disabled || loading;
  const hasGlow = !!palette.glow && !isDisabled;
  const glowStyle = hasGlow
    ? Platform.select<ViewStyle>({
        web: {
          boxShadow: `0px 0px 8px ${palette.glow}, 0px 4px 10px rgba(0, 0, 0, 0.35)`,
        },
        default: {
          shadowColor: palette.glow,
          shadowOpacity: 0.5,
          shadowRadius: 8,
        },
      })
    : null;

  const sizeStyles = {
    small: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      fontSize: 12,
      iconSize: 14,
    },
    medium: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      fontSize: 16,
      iconSize: 18,
    },
    large: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl * 1.5,
      fontSize: 18,
      iconSize: 20,
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && !isDisabled ? palette.backgroundPressed : palette.background,
          borderColor: palette.border,
          paddingVertical: currentSize.paddingVertical,
          paddingHorizontal: currentSize.paddingHorizontal,
        },
        glowStyle,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <>
          {icon && (
            <Ionicons 
              name={icon} 
              size={currentSize.iconSize} 
              color={palette.text} 
              style={styles.icon}
            />
          )}
          <Text style={[styles.label, { color: palette.text, fontSize: currentSize.fontSize }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md, // Updated radius
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.35)' }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }),
    elevation: 4,
  },
  icon: {
    marginRight: 4,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    ...typography.body, // Now uses 500 weight
    fontWeight: '600', // Still keep it a bit bolder for buttons
  },
});
