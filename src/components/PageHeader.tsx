import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  actions,
  style,
}: PageHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.leftColumn}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
            <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={styles.copy}>
          {eyebrow ? (
            <AppText variant="micro" style={styles.eyebrow}>
              {eyebrow}
            </AppText>
          ) : null}
          <AppText variant="h2" style={styles.title}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="small" secondary style={styles.subtitle}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  leftColumn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    flex: 1,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    marginTop: 2,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.accentPrimary,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    letterSpacing: -0.7,
  },
  subtitle: {
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
