import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  confirmColor?: string;
};

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  icon,
  iconColor = colors.accentPrimary,
  confirmColor = colors.accentPrimary,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <View style={styles.wrapper}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY: slideAnim }],
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={styles.handle} />

          {icon && (
            <View style={[styles.iconCircle, { backgroundColor: `${iconColor}1A` }]}>
              <Ionicons name={icon} size={28} color={iconColor} />
            </View>
          )}

          <AppText variant="h2" style={styles.title}>
            {title}
          </AppText>
          <AppText variant="small" secondary style={styles.message}>
            {message}
          </AppText>

          <View style={styles.actions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onCancel}
            >
              <AppText style={styles.cancelText}>{cancelLabel}</AppText>
            </Pressable>

            <Pressable
              style={[styles.confirmBtn, { backgroundColor: confirmColor }]}
              onPress={onConfirm}
            >
              <AppText style={styles.confirmText}>{confirmLabel}</AppText>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayDarkStrong,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md + spacing.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.md + spacing.xxs,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
