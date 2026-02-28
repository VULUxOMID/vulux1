import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { adminTokens, AdminTone } from './adminTokens';

type CardTone = AdminTone;
type ButtonTone = AdminTone;

const toneConfig: Record<AdminTone, { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  neutral: {
    bg: adminTokens.colors.surfaceAlt,
    border: adminTokens.colors.border,
    text: adminTokens.colors.textSecondary,
    icon: 'information-circle-outline',
  },
  primary: {
    bg: adminTokens.colors.primarySubtle,
    border: adminTokens.colors.primaryBorder,
    text: adminTokens.colors.primary,
    icon: 'flash',
  },
  success: {
    bg: adminTokens.colors.successSubtle,
    border: adminTokens.colors.successBorder,
    text: adminTokens.colors.success,
    icon: 'checkmark-circle',
  },
  warning: {
    bg: adminTokens.colors.warningSubtle,
    border: adminTokens.colors.warningBorder,
    text: adminTokens.colors.warning,
    icon: 'alert-circle',
  },
  danger: {
    bg: adminTokens.colors.dangerSubtle,
    border: adminTokens.colors.dangerBorder,
    text: adminTokens.colors.danger,
    icon: 'warning',
  },
};

export function AdminPageContainer({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.pageContainer, style]}>{children}</View>;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTextWrap}>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageDescription}>{description}</Text>
      </View>
      {actions ? <View style={styles.pageActions}>{actions}</View> : null}
    </View>
  );
}

export function AdminSectionHeader({
  title,
  description,
  filters,
}: {
  title: string;
  description?: string;
  filters?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderTop}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      </View>
      {filters ? <View style={styles.filtersRow}>{filters}</View> : null}
    </View>
  );
}

export function AdminCard({
  title,
  subtitle,
  children,
  footer,
  tone = 'neutral',
  style,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyles = toneConfig[tone];
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: tone === 'neutral' ? adminTokens.colors.border : toneStyles.border,
          backgroundColor: tone === 'neutral' ? adminTokens.colors.surface : toneStyles.bg,
        },
        style,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      </View>
      {children ? <View style={styles.cardBody}>{children}</View> : null}
      {footer ? <View style={styles.cardFooter}>{footer}</View> : null}
    </View>
  );
}

export function ReadOnlyCard(props: Omit<React.ComponentProps<typeof AdminCard>, 'tone'>) {
  return <AdminCard tone="neutral" {...props} />;
}

export function ActionCard(props: Omit<React.ComponentProps<typeof AdminCard>, 'tone'> & { tone?: CardTone }) {
  const { tone = 'primary', ...rest } = props;
  return <AdminCard tone={tone} {...rest} />;
}

export function AdminActionBanner({ tone, message }: { tone: AdminTone; message: string }) {
  const toneStyles = toneConfig[tone];
  return (
    <View style={[styles.banner, { backgroundColor: toneStyles.bg, borderColor: toneStyles.border }]}>
      <Ionicons name={toneStyles.icon} size={14} color={toneStyles.text} />
      <Text style={[styles.bannerText, { color: toneStyles.text }]}>{message}</Text>
    </View>
  );
}

export function AdminStatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: AdminTone;
}) {
  const toneStyles = toneConfig[tone];
  return (
    <View style={[styles.chip, { backgroundColor: toneStyles.bg, borderColor: toneStyles.border }]}>
      <Text style={[styles.chipText, { color: toneStyles.text }]}>{label}</Text>
    </View>
  );
}

export function AdminBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: AdminTone;
}) {
  const toneStyles = toneConfig[tone];
  return (
    <View style={[styles.badge, { backgroundColor: toneStyles.bg, borderColor: toneStyles.border }]}>
      <Text style={[styles.badgeText, { color: toneStyles.text }]}>{label}</Text>
    </View>
  );
}

export function AdminButton({
  label,
  onPress,
  tone = 'neutral',
  loading,
  disabled,
  disabledReason,
  icon,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const toneStyles = toneConfig[tone];
  const isDisabled = disabled || loading;
  const isNeutral = tone === 'neutral';
  const buttonBackground = isNeutral ? adminTokens.colors.surfaceAlt : toneStyles.bg;
  const buttonBorder = isNeutral ? adminTokens.colors.border : toneStyles.border;
  const buttonText = isNeutral ? adminTokens.colors.textPrimary : toneStyles.text;

  return (
    <View style={styles.buttonBlock}>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityHint={isDisabled && disabledReason ? disabledReason : undefined}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: buttonBorder,
            backgroundColor: buttonBackground,
            opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1,
          },
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={buttonText} /> : null}
        {!loading && icon ? <Ionicons name={icon} size={14} color={buttonText} /> : null}
        <Text style={[styles.buttonText, { color: buttonText }]}>{label}</Text>
      </Pressable>
      {isDisabled && disabledReason ? <Text style={styles.buttonHint}>{disabledReason}</Text> : null}
    </View>
  );
}

export function AdminTextInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={adminTokens.colors.textMuted}
      style={[styles.textInput, multiline ? styles.textArea : null]}
      multiline={multiline}
      keyboardType={keyboardType}
    />
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: adminTokens.colors.pageBg,
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingBottom: adminTokens.spacing.pageY,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: adminTokens.spacing.gapMd,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: adminTokens.spacing.gapMd,
  },
  pageHeaderTextWrap: {
    flex: 1,
    gap: adminTokens.spacing.gapSm,
  },
  pageTitle: {
    ...adminTokens.typography.pageTitle,
    color: adminTokens.colors.textPrimary,
  },
  pageDescription: {
    ...adminTokens.typography.pageDescription,
    color: adminTokens.colors.textSecondary,
  },
  pageActions: {
    flexDirection: 'row',
    gap: adminTokens.spacing.gapSm,
  },
  sectionHeader: {
    gap: adminTokens.spacing.gapSm,
    marginBottom: adminTokens.spacing.gapMd,
  },
  sectionHeaderTop: {
    gap: adminTokens.spacing.gapSm,
  },
  sectionTitle: {
    ...adminTokens.typography.sectionTitle,
    color: adminTokens.colors.textPrimary,
  },
  sectionDescription: {
    ...adminTokens.typography.sectionDescription,
    color: adminTokens.colors.textSecondary,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  card: {
    borderWidth: adminTokens.border.width,
    borderRadius: adminTokens.radius.card,
    padding: adminTokens.spacing.card,
    gap: adminTokens.spacing.gapMd,
  },
  cardHeader: {
    gap: adminTokens.spacing.gapSm,
  },
  cardTitle: {
    ...adminTokens.typography.cardTitle,
    color: adminTokens.colors.textPrimary,
  },
  cardSubtitle: {
    ...adminTokens.typography.cardSubtitle,
    color: adminTokens.colors.textSecondary,
  },
  cardBody: {
    gap: adminTokens.spacing.gapSm,
  },
  cardFooter: {
    gap: adminTokens.spacing.gapSm,
  },
  chip: {
    borderWidth: adminTokens.border.width,
    borderRadius: adminTokens.radius.chip,
    paddingHorizontal: adminTokens.spacing.gapSm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chipText: {
    ...adminTokens.typography.badge,
    textTransform: 'uppercase',
  },
  badge: {
    borderWidth: adminTokens.border.width,
    borderRadius: adminTokens.radius.input,
    paddingHorizontal: adminTokens.spacing.gapSm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeText: {
    ...adminTokens.typography.badge,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
    borderWidth: adminTokens.border.width,
    borderRadius: adminTokens.radius.input,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
  },
  bannerText: {
    ...adminTokens.typography.caption,
    flex: 1,
  },
  buttonBlock: {
    gap: 4,
  },
  button: {
    borderWidth: adminTokens.border.width,
    borderRadius: adminTokens.radius.button,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: adminTokens.spacing.gapSm,
  },
  buttonText: {
    ...adminTokens.typography.caption,
    letterSpacing: 0.3,
  },
  buttonHint: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textMuted,
  },
  textInput: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
    color: adminTokens.colors.textPrimary,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
    ...adminTokens.typography.body,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
