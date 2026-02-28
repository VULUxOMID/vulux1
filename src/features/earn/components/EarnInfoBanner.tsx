import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

const DEFAULT_MESSAGE =
  'Earn free cash by watching ads. Use it to play games or save up for rewards!';

type EarnInfoBannerProps = {
  message?: string;
  style?: StyleProp<ViewStyle>;
};

export const EarnInfoBanner = React.memo(function EarnInfoBanner({
  message = DEFAULT_MESSAGE,
  style,
}: EarnInfoBannerProps) {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="information-circle" size={24} color={colors.accentPrimary} />
      <AppText variant="small" style={styles.message}>
        {message}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.accentPrimary}40`,
    marginBottom: spacing.xl,
  },
  message: {
    flex: 1,
  },
});
