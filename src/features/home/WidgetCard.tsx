import { PropsWithChildren } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export type WidgetCardProps = PropsWithChildren<{
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function WidgetCard({ children, onPress, style, contentStyle }: WidgetCardProps) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.card, style]}>
        <View style={contentStyle}>{children}</View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
});
