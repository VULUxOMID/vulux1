import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '../../../components';
import { colors, spacing } from '../../../theme';
import { HomePillCard } from './HomePillCard';

export function GlobalChatWidget({
  messageCount,
  isChatOpen,
  onOpen,
}: {
  messageCount: number;
  isChatOpen: boolean;
  onOpen: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const prevMsgCount = useRef(messageCount);
  const [hasUnread, setHasUnread] = useState(false);
  const baseBorderColor = hasUnread ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.08)';

  useEffect(() => {
    if (messageCount > prevMsgCount.current && !isChatOpen) {
      setHasUnread(true);
      flashAnim.stopAnimation();
      flashAnim.setValue(1);
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 650,
        useNativeDriver: true,
      }).start();
    }
    prevMsgCount.current = messageCount;

    return () => {
      flashAnim.stopAnimation();
    };
  }, [flashAnim, isChatOpen, messageCount]);

  useEffect(() => {
    if (isChatOpen) setHasUnread(false);
  }, [isChatOpen]);

  const runPop = () => {
    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 840,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleOpen = () => {
    setHasUnread(false);
    flashAnim.stopAnimation();
    flashAnim.setValue(0);
    onOpen();
  };

  const rightContent = (
    <View style={styles.rightCluster}>
      <View style={[styles.badgePill, !hasUnread && messageCount === 0 && { opacity: 0 }]}>
        <AppText variant="small" style={styles.badgePillText}>
          {messageCount > 99 ? '99+' : messageCount}
        </AppText>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.animatedWrap, { transform: [{ scale }] }]}>
      <HomePillCard
        title="Global chat"
        leftIcon="planet"
        leftIconSize={20}
        onPress={handleOpen}
        onPressIn={runPop}
        rightContent={rightContent}
        showChevron={false}
        density="compact"
        headerHeight={48}
      />
      <View
        style={[styles.persistentBorder, { borderColor: baseBorderColor }, styles.pointerEventsNone]}
      />
      <Animated.View
        style={[styles.flashBorder, { opacity: flashAnim }, styles.pointerEventsNone]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  animatedWrap: {
    position: 'relative',
  },
  badgePill: {
    minWidth: 24,
    height: 18,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 68, 88, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    ...Platform.select({
      web: {
        boxShadow: `0px 2px 4px ${colors.accentDanger}4D`,
      },
      default: {
        shadowColor: colors.accentDanger,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
    }),
  },
  badgePillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  persistentBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 16,
  },
  flashBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: 'rgba(255,255,255,1)',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
});
