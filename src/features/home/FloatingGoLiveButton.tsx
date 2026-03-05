import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, ViewStyle } from 'react-native';

import { AppButton } from '../../components';
import { NAV_BAR_HEIGHT } from '../../components/navigation/layoutConstants';
import { colors, radius, spacing } from '../../theme';

export type FloatingGoLiveButtonProps = {
  visible: boolean;
  bottomInset: number;
  onPress: () => void;
};

export function FloatingGoLiveButton({ visible, bottomInset, onPress }: FloatingGoLiveButtonProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [anim, visible]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        visible ? styles.pointerEventsAuto : styles.pointerEventsNone,
        {
          bottom: NAV_BAR_HEIGHT + bottomInset + spacing.md,
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1],
              }),
            },
          ],
        },
      ]}
    >
      <AppButton
        title="Go Live"
        variant="danger"
        onPress={onPress}
        style={styles.button}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25,
  } as ViewStyle,
  pointerEventsAuto: {
    pointerEvents: 'auto',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  button: {
    width: '60%',
    maxWidth: 260,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: `0px 0px 12px ${colors.accentDanger}66`,
      },
      default: {
        shadowColor: colors.accentDanger,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
});
