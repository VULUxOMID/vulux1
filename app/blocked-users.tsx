import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { colors, radius, spacing } from '../src/theme';
import { normalizeImageUri } from '../src/utils/imageSource';

type BlockedUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
};

function BlockedUsersHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="h3" style={styles.headerTitle}>{title}</AppText>
      <View style={styles.headerRight} />
    </View>
  );
}

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);

  const handleUnblock = (id: string) => {
    setBlockedUsers(prev => prev.filter(u => u.id !== id));
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const avatarUri = normalizeImageUri(item.avatarUrl);
    return (
      <View style={styles.userRow}>
        <View style={styles.userInfo}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          <View>
            <AppText style={styles.name}>{item.name}</AppText>
            <AppText style={styles.username}>@{item.username}</AppText>
          </View>
        </View>
        <Pressable
          style={styles.unblockButton}
          onPress={() => handleUnblock(item.id)}
        >
          <AppText style={styles.unblockText}>Unblock</AppText>
        </Pressable>
      </View>
    );
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <BlockedUsersHeader 
        title="Blocked Users" 
        onBack={() => router.back()} 
      />

      <FlatList
        data={blockedUsers}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />
            <AppText style={styles.emptyText}>No blocked users</AppText>
          </View>
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  headerRight: {
    width: 32,
  },
  listContent: {
    padding: spacing.lg,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  username: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  unblockButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  unblockText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
