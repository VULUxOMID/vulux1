import { View } from 'react-native';

import { CurrencyPill } from '../../../components';
import { colors, spacing } from '../../../theme';
import { TopBar } from '../../home/TopBar';

type ShopHeaderProps = {
  gems: number;
  cash: number;
  onPressGems?: () => void;
  onPressCash?: () => void;
};

export function ShopHeader({
  gems,
  cash,
  onPressGems,
  onPressCash,
}: ShopHeaderProps) {
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
        color={colors.accentSuccess}
        onPress={onPressCash}
        showDot={false}
      />
    </View>
  );

  return (
    <TopBar title="Shop" variant="page" actions={actions} />
  );
}
