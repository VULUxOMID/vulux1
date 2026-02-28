import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppButton, AppScreen, AppText } from '../../components';
import { colors, spacing } from '../../theme';

type AuthLoadingScreenProps = {
  title?: string;
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
};

export function AuthLoadingScreen({
  title = 'Restoring your session',
  detail,
  actionLabel,
  onAction,
}: AuthLoadingScreenProps) {
  return (
    <AppScreen style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <AppText variant="h3" style={styles.title}>
          {title}
        </AppText>
        <AppText secondary style={styles.detail}>
          {detail ?? 'Vulu is reconnecting to Clerk and SpacetimeDB.'}
        </AppText>
        {actionLabel && onAction ? (
          <AppButton
            title={actionLabel}
            onPress={onAction}
            variant="outline"
            style={styles.button}
          />
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    textAlign: 'center',
  },
  detail: {
    textAlign: 'center',
  },
  button: {
    minWidth: 160,
  },
});
