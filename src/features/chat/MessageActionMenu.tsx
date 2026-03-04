import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';

type ActionId = 'reply' | 'copy' | 'edit' | 'delete';

type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ActionTone = 'brand' | 'neutral' | 'primary' | 'danger';

type ActionItem = {
  id: ActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ActionTone;
};

export type MessageActionMenuProps = {
  visible: boolean;
  anchor: AnchorRect | null;
  isMine: boolean;
  onClose: () => void;
  onAction: (id: ActionId) => void;
  onReaction?: (emoji: string) => void;
};

export function MessageActionMenu({ visible, anchor, isMine, onClose, onAction, onReaction }: MessageActionMenuProps) {
  const [mounted, setMounted] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const actions = useMemo<ActionItem[]>(() => {
    const base: ActionItem[] = [
      { id: 'reply', label: 'Reply', icon: 'return-up-back', tone: 'brand' },
      { id: 'copy', label: 'Copy', icon: 'copy-outline', tone: 'neutral' },
    ];
    if (isMine) {
      base.push({ id: 'edit', label: 'Edit', icon: 'pencil-outline', tone: 'primary' });
      base.push({ id: 'delete', label: 'Delete', icon: 'trash-outline', tone: 'danger' });
    }
    return base;
  }, [isMine]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      anim.stopAnimation();
      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 16,
        stiffness: 220,
      }).start();
      return;
    }

    if (!mounted) return;
    Animated.timing(anim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => setMounted(false));
  }, [anim, mounted, visible]);

  if (!mounted || !anchor) return null;

  const { width: SW, height: SH } = Dimensions.get('window');
  const MENU_W = 220;
  const ITEM_H = 44;
  const MENU_H = actions.length * ITEM_H + 12;

  const preferAbove = anchor.y > SH * 0.35;
  const top = preferAbove
    ? Math.max(12, anchor.y - MENU_H - 10)
    : Math.min(SH - MENU_H - 12, anchor.y + anchor.height + 10);

  const left = Math.min(SW - MENU_W - 12, Math.max(12, anchor.x + anchor.width - MENU_W));

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  const toneColor = (tone: ActionTone) => {
    if (tone === 'brand') return colors.accentPremium;
    if (tone === 'primary') return colors.accentPrimary;
    if (tone === 'danger') return colors.accentDanger;
    return colors.textPrimary;
  };

  const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Full screen backdrop */}
        <Pressable 
          style={StyleSheet.absoluteFill} 
          onPress={onClose}
        />
        
        <Animated.View
          style={[
            styles.menu,
            {
              top,
              left,
              width: MENU_W,
              opacity: anim,
              transform: [{ scale }],
              pointerEvents: 'auto',
            },
          ]}
        >
          {/* Reactions Row */}
          <View style={styles.reactionsRow}>
            {reactionEmojis.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  onReaction?.(emoji);
                  onClose();
                }}
                style={({ pressed }) => [styles.reactionItem, pressed && styles.reactionPressed]}
              >
                <AppText style={styles.reactionEmoji}>{emoji}</AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.separator} />

          {actions.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onAction(a.id)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Ionicons name={a.icon} size={18} color={toneColor(a.tone)} style={styles.icon} />
              <AppText variant="body" style={[styles.label, { color: toneColor(a.tone) }]}>
                {a.label}
              </AppText>
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Dim background slightly when menu is open
  },
  menu: {
    position: 'absolute',
    borderRadius: radius.lg,
    paddingVertical: 6,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.35)' }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }),
    elevation: 12,
    zIndex: 100,
  },
  reactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  reactionItem: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  reactionPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ scale: 1.2 }],
  },
  reactionEmoji: {
    fontSize: 18,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
    marginHorizontal: spacing.sm,
  },
  item: {
    height: 44,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    marginHorizontal: 6,
  },
  itemPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  icon: {
    marginRight: 10,
  },
  label: {
    fontWeight: '600',
  },
});
