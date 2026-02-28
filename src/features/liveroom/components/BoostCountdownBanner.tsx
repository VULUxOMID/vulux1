import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap, hapticImpact } from '../../../utils/haptics';

// Unified boost color
const BOOST_RED = '#FF6B6B';

type BoostCountdownBannerProps = {
  timeLeft: number; // seconds remaining (only shows when <= 10)
  onBoostPress: () => void;
  onQuickBoost: () => void; // Direct 1x boost without popup
  visible: boolean;
};

export function BoostCountdownBanner({ 
  timeLeft, 
  onBoostPress,
  onQuickBoost,
  visible,
}: BoostCountdownBannerProps) {
  const hasShownRef = useRef(false);
  const lastHapticRef = useRef(0);

  // Multiple vibration function
  const vibrateMultiple = async (count: number, interval: number = 200) => {
    for (let i = 0; i < count; i++) {
      hapticImpact('medium');
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  };

  // Haptic warnings with multiple vibrations
  useEffect(() => {
    if (visible && timeLeft > 0) {
      const now = Date.now();
      
      // Multiple vibrations when banner first appears
      if (!hasShownRef.current) {
        vibrateMultiple(5, 150); // 5 vibrations, 150ms apart
        hasShownRef.current = true;
        lastHapticRef.current = now;
      }
      
      // Multiple vibrations at last 3 seconds
      if (timeLeft <= 3 && timeLeft > 2.9 && now - lastHapticRef.current > 1000) {
        vibrateMultiple(4, 200); // 4 vibrations, 200ms apart
        lastHapticRef.current = now;
      }
    } else {
      hasShownRef.current = false;
    }
  }, [visible, timeLeft]);

  if (!visible || timeLeft <= 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        {/* Timer */}
        <View style={styles.timerSection}>
          <Ionicons name="time-outline" size={18} color="#fff" />
          <AppText style={styles.timerText}>{timeLeft}s</AppText>
        </View>

        {/* Message */}
        <AppText style={styles.message}>Boost expiring!</AppText>

        {/* Quick Boost Button - 1x boost directly */}
        <Pressable 
          style={styles.boostButton}
          onPress={() => {
            hapticImpact('heavy');
            onQuickBoost();
          }}
        >
          <Ionicons name="flash" size={18} color="#fff" />
          <AppText style={styles.boostButtonText}>+1</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: 80, // Leave space for boost button
    bottom: 130, // Much higher above input bar to avoid overlap
    zIndex: 50,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BOOST_RED,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    shadowColor: BOOST_RED,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  timerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  boostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  boostButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});


