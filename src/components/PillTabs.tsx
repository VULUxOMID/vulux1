import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

export type PillTabItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
  accessibilityLabel?: string;
};

type PillTabsProps = {
  items: PillTabItem[];
  value: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  tabItemStyle?: StyleProp<ViewStyle>;
  activeTabItemStyle?: StyleProp<ViewStyle>;
  activeTabLabelStyle?: StyleProp<TextStyle>;
  inactiveTabLabelStyle?: StyleProp<TextStyle>;
};

export function PillTabs({
  items,
  value,
  onChange,
  style,
  tabItemStyle,
  activeTabItemStyle,
  activeTabLabelStyle,
  inactiveTabLabelStyle,
}: PillTabsProps) {
  return (
    <View style={[styles.container, style]}>
      {items.map((item) => {
        const isActive = item.key === value;
        const iconColor = isActive
          ? item.accentColor ?? colors.textPrimary
          : colors.textMuted;
        const labelColor = isActive
          ? item.accentColor ?? colors.textPrimary
          : colors.textMuted;

        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[
              styles.tabItem,
              tabItemStyle,
              isActive && styles.tabItemActive,
              isActive && activeTabItemStyle,
            ]}
            accessibilityRole="tab"
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            accessibilityState={{ selected: isActive }}
          >
            {item.icon ? (
              <Ionicons name={item.icon} size={20} color={iconColor} />
            ) : null}
            <AppText
              variant="small"
              style={[
                styles.tabLabel,
                isActive && styles.tabLabelActive,
                { color: labelColor },
                isActive ? activeTabLabelStyle : inactiveTabLabelStyle,
              ]}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lgMinus,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  tabLabel: {
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
