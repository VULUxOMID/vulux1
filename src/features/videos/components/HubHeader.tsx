import { StyleSheet, View } from 'react-native';

import { AppText, CurrencyPill } from '../../../components';
import { colors, spacing } from '../../../theme';

type HubHeaderProps = {
  gems: number;
  cash: number;
  onPressGems?: () => void;
  onPressCash?: () => void;
};

export function HubHeader({
  gems,
  cash,
  onPressGems,
  onPressCash,
}: HubHeaderProps) {
  return (
    <View style={styles.header}>
      <AppText variant="h1">Hub</AppText>
      <View style={styles.actions}>
        <CurrencyPill
          icon="prism"
          label={gems.toString()}
          color={colors.accentPremium}
          onPress={onPressGems}
          showDot={false}
        />
        <CurrencyPill
          icon="cash"
          label={cash.toString()}
          color={colors.accentCash}
          onPress={onPressCash}
          showDot={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
