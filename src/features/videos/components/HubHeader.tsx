import { View } from 'react-native';

import { CurrencyPill } from '../../../components';
import { colors, spacing } from '../../../theme';
import { TopBar } from '../../home/TopBar';

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
  const actions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
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
  );

  return (
    <TopBar title="Hub" variant="page" actions={actions} />
  );
}
