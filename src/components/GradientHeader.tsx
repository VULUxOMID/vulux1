import { ReactNode } from 'react';
import { ColorValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radius, spacing, type TypographyVariant } from '../theme';
import { AppText } from './AppText';

type GradientHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  gradientColors?: readonly [ColorValue, ColorValue, ...ColorValue[]];
  style?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleVariant?: TypographyVariant;
  subtitleVariant?: TypographyVariant;
};

export function GradientHeader({
  title,
  subtitle,
  icon,
  action,
  children,
  gradientColors,
  style,
  headerStyle,
  contentStyle,
  titleVariant = 'h3',
  subtitleVariant = 'small',
}: GradientHeaderProps) {
  return (
    <LinearGradient
      colors={gradientColors ?? ([colors.surface, colors.surfaceAlt] as const)}
      style={[styles.container, style]}
    >
      <View style={[styles.header, headerStyle]}>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <AppText variant={titleVariant}>{title}</AppText>
          </View>
          {subtitle ? (
            <AppText variant={subtitleVariant} secondary>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {children ? <View style={[styles.content, contentStyle]}>{children}</View> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    alignItems: 'flex-end',
  },
  content: {
    marginTop: spacing.md,
  },
});
