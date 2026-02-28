import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import type { PresenceStatus } from '../../context/UserProfileContext';

type PresenceStatusModalProps = {
  visible: boolean;
  value: PresenceStatus;
  initialStatusMessage?: string;
  onClose: () => void;
  onApply: (status: PresenceStatus, statusMessage?: string) => void;
};

const STATUS_OPTIONS: Array<{
  key: PresenceStatus;
  label: string;
  description: string;
  color: string;
}> = [
    {
      key: 'online',
      label: 'Online',
      description: 'Available to chat',
      color: colors.accentSuccess,
    },
    {
      key: 'busy',
      label: 'Busy',
      description: 'Do not disturb',
      color: colors.accentDanger,
    },
    {
      key: 'offline',
      label: 'Offline',
      description: 'Appear offline',
      color: colors.textMuted,
    },
  ];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.45; // reduced since we removed the text input
const SNAP_THRESHOLD = SHEET_HEIGHT * 0.28;
const SPRING_CONFIG = {
  stiffness: 140,
  damping: 16,
  mass: 1.2,
};
const DRAG_DAMPING = 0.35;
const DRAG_LIMIT = -70;

export function PresenceStatusModal({
  visible,
  value,
  initialStatusMessage,
  onClose,
  onApply,
}: PresenceStatusModalProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(visible);
  const [selectedStatus, setSelectedStatus] = useState<PresenceStatus>(value);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const translateYValue = useRef(SHEET_HEIGHT);
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_HEIGHT * 0.35, SHEET_HEIGHT],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const id = translateY.addListener(({ value: nextValue }) => {
      translateYValue.current = nextValue;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  useEffect(() => {
    if (visible) {
      setSelectedStatus(value);
      setIsVisible(true);
      translateY.setValue(SHEET_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        ...SPRING_CONFIG,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (isVisible) {
      Animated.spring(translateY, {
        toValue: SHEET_HEIGHT,
        ...SPRING_CONFIG,
        useNativeDriver: true,
      }).start(() => setIsVisible(false));
    }
  }, [visible, isVisible, translateY, value]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        translateY.setOffset(translateYValue.current);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const rawDrag = gestureState.dy;
        const dampedDrag = rawDrag < 0 ? rawDrag * DRAG_DAMPING : rawDrag;
        const clampedDrag = Math.max(dampedDrag, DRAG_LIMIT);
        translateY.setValue(clampedDrag);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        const shouldClose =
          gestureState.dy > SNAP_THRESHOLD || gestureState.vy > 0.9;

        if (shouldClose) {
          handleClose();
          return;
        }

        Animated.spring(translateY, {
          toValue: 0,
          ...SPRING_CONFIG,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const handleStatusSelect = (status: PresenceStatus) => {
    setSelectedStatus(status);
    onApply(status, initialStatusMessage);
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const handleNavToSetStatus = () => {
    onClose();
    // Use setTimeout to allow modal exit animation to start seamlessly
    setTimeout(() => {
      router.push('/set-status');
    }, 150);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Modal
      visible={isVisible}
      transparent
      onRequestClose={handleClose}
      animationType="none"
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdropOverlay, { opacity: backdropOpacity }]} />
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <AppText variant="h3" style={styles.title}>
              Online Status
            </AppText>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {STATUS_OPTIONS.map((option) => {
              const isActive = option.key === selectedStatus;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => handleStatusSelect(option.key)}
                  style={({ pressed }) => [
                    styles.option,
                    isActive && styles.optionActive,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={styles.optionLeft}>
                    <View
                      style={[styles.statusDot, { backgroundColor: option.color }]}
                    />
                    <View style={styles.optionText}>
                      <AppText style={styles.optionLabel}>{option.label}</AppText>
                      <AppText
                        variant="tiny"
                        muted
                        style={styles.optionDescription}
                      >
                        {option.description}
                      </AppText>
                    </View>
                  </View>
                  {isActive ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.textPrimary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.customStatusButton,
                pressed && styles.optionPressed
              ]}
              onPress={handleNavToSetStatus}
            >
              <View style={styles.customStatusLeft}>
                <Ionicons name="happy-outline" size={20} color={colors.textPrimary} />
                <AppText style={styles.customStatusLabel}>
                  {initialStatusMessage && initialStatusMessage.trim().length > 0
                    ? `Update custom status...`
                    : `Set a custom status...`}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    width: '100%',
    minHeight: SHEET_HEIGHT,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  dragHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    color: colors.textPrimary,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  optionActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surface,
  },
  optionPressed: {
    opacity: 0.85,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  optionDescription: {
    marginTop: spacing.xxs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  customStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  customStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  customStatusLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
