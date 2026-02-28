import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type ToastType = 'error' | 'warning' | 'success' | 'info';

export type ToastProps = {
  message: string;
  type?: ToastType;
  duration?: number;
  visible: boolean;
  onHide: () => void;
};

export function Toast({ message, type = 'info', duration = 3000, visible, onHide }: ToastProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(-100));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => onHide());
  };

  if (!visible) return null;

  const getToastStyle = () => {
    switch (type) {
      case 'error':
        return styles.errorToast;
      case 'warning':
        return styles.warningToast;
      case 'success':
        return styles.successToast;
      default:
        return styles.infoToast;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        getToastStyle(),
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      <AppText style={styles.text}>{message}</AppText>
    </Animated.View>
  );
}

// Toast Manager for global usage
class ToastManager {
  private static instance: ToastManager;
  private listeners: Array<(toast: ToastProps | null) => void> = [];
  private currentToast: ToastProps | null = null;

  static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  subscribe(listener: (toast: ToastProps | null) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener(this.currentToast));
  }

  show(message: string, type: ToastType = 'info', duration?: number) {
    this.currentToast = {
      message,
      type,
      duration,
      visible: true,
      onHide: () => this.hide(),
    };
    this.notify();
  }

  hide() {
    if (this.currentToast) {
      this.currentToast = null;
      this.notify();
    }
  }

  error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }

  warning(message: string, duration?: number) {
    this.show(message, 'warning', duration);
  }

  success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  info(message: string, duration?: number) {
    this.show(message, 'info', duration);
  }
}

export const toast = ToastManager.getInstance();

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  errorToast: {
    backgroundColor: colors.accentDanger,
  },
  warningToast: {
    backgroundColor: colors.accentWarning,
  },
  successToast: {
    backgroundColor: colors.accentSuccess,
  },
  infoToast: {
    backgroundColor: colors.accentPrimary,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
