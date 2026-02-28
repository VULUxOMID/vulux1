import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { adminTokens, AdminTone } from '../ui/adminTokens';

type AdminToastTone = Exclude<AdminTone, 'neutral'>;

type AdminToastPayload = {
  message: string;
  tone?: AdminToastTone;
  durationMs?: number;
};

type AdminToastContextValue = {
  showToast: (payload: AdminToastPayload) => void;
};

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

const toneStyles: Record<AdminToastTone, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; border: string }> = {
  primary: {
    icon: 'flash',
    color: adminTokens.colors.primary,
    bg: adminTokens.colors.primarySubtle,
    border: adminTokens.colors.primaryBorder,
  },
  success: {
    icon: 'checkmark-circle',
    color: adminTokens.colors.success,
    bg: adminTokens.colors.successSubtle,
    border: adminTokens.colors.successBorder,
  },
  warning: {
    icon: 'warning',
    color: adminTokens.colors.warning,
    bg: adminTokens.colors.warningSubtle,
    border: adminTokens.colors.warningBorder,
  },
  danger: {
    icon: 'alert-circle',
    color: adminTokens.colors.danger,
    bg: adminTokens.colors.dangerSubtle,
    border: adminTokens.colors.dangerBorder,
  },
};

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-80)).current;
  const [toast, setToast] = useState<Required<AdminToastPayload> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -80,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setToast(null);
    });
  }, [translateY]);

  const showToast = useCallback(
    ({ message, tone = 'primary', durationMs = 2200 }: AdminToastPayload) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setToast({ message, tone, durationMs });
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();

      timeoutRef.current = setTimeout(() => {
        hideToast();
      }, durationMs);
    },
    [hideToast, translateY]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              top: insets.top + adminTokens.spacing.gapSm,
              transform: [{ translateY }],
              backgroundColor: toneStyles[toast.tone].bg,
              borderColor: toneStyles[toast.tone].border,
            },
          ]}
        >
          <Ionicons name={toneStyles[toast.tone].icon} size={16} color={toneStyles[toast.tone].color} />
          <Text style={[styles.toastText, { color: toneStyles[toast.tone].color }]} numberOfLines={2}>
            {toast.message}
          </Text>
          <Pressable onPress={hideToast} hitSlop={8}>
            <Ionicons name="close" size={16} color={adminTokens.colors.textSecondary} />
          </Pressable>
        </Animated.View>
      ) : null}
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(AdminToastContext);
  if (!context) {
    throw new Error('useAdminToast must be used within AdminToastProvider');
  }

  return {
    showToast: context.showToast,
    primary: (message: string) => context.showToast({ message, tone: 'primary' }),
    success: (message: string) => context.showToast({ message, tone: 'success' }),
    error: (message: string) => context.showToast({ message, tone: 'danger' }),
    warning: (message: string) => context.showToast({ message, tone: 'warning' }),
    info: (message: string) => context.showToast({ message, tone: 'primary' }),
  };
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: adminTokens.spacing.pageX,
    right: adminTokens.spacing.pageX,
    borderWidth: adminTokens.border.width,
    borderRadius: adminTokens.radius.input,
    paddingVertical: adminTokens.spacing.gapSm,
    paddingHorizontal: adminTokens.spacing.gapMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
    zIndex: 999,
  },
  toastText: {
    ...adminTokens.typography.caption,
    flex: 1,
  },
});
