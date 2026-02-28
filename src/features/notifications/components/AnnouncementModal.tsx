import React from 'react';
import { Modal, StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { AnnouncementNotification } from '../types';

interface AnnouncementModalProps {
  visible: boolean;
  onClose: () => void;
  announcement: AnnouncementNotification | null;
}

export function AnnouncementModal({ visible, onClose, announcement }: AnnouncementModalProps) {
  if (!announcement) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <Ionicons name="megaphone" size={24} color="#fff" />
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <AppText style={styles.title}>{announcement.title}</AppText>
          
          <View style={styles.metaRow}>
            <AppText style={styles.sourceName}>{announcement.sourceName}</AppText>
            <View style={styles.dot} />
            <AppText style={styles.date}>
              {new Date(announcement.createdAt).toLocaleDateString()}
            </AppText>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <AppText style={styles.message}>{announcement.message}</AppText>
          </ScrollView>

          <Pressable style={styles.button} onPress={onClose}>
            <AppText style={styles.buttonText}>Close</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    position: 'relative',
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sourceName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  date: {
    fontSize: 14,
    color: colors.textMuted,
  },
  scroll: {
    width: '100%',
    maxHeight: 200,
    marginBottom: spacing.xl,
  },
  scrollContent: {
    paddingHorizontal: spacing.sm,
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
