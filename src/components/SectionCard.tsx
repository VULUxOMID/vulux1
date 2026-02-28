import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing, type TypographyVariant } from '../theme';
import { AppText } from './AppText';

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
  variant?: 'default' | 'alt';
  titleVariant?: TypographyVariant;
  subtitleVariant?: TypographyVariant;
};

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  style,
  contentStyle,
  headerStyle,
  variant = 'default',
  titleVariant = 'h3',
  subtitleVariant = 'small',
}: SectionCardProps) {
  const showHeader = Boolean(title || subtitle || action);

  return (
    <View
      style={[
        styles.container,
        variant === 'alt' && styles.containerAlt,
        style,
      ]}
    >
      {showHeader ? (
        <View style={[styles.header, headerStyle]}>
          <View style={styles.headerText}>
            {title ? <AppText variant={titleVariant}>{title}</AppText> : null}
            {subtitle ? (
              <AppText variant={subtitleVariant} secondary>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      {children ? (
        <View style={[styles.content, contentStyle]}>{children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  containerAlt: {
    backgroundColor: colors.surfaceAlt,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  action: {
    alignItems: 'flex-end',
  },
  content: {
    gap: spacing.md,
  },
});
