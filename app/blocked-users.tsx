import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import { AppScreen, AppText, PageHeader } from '../src/components';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '../src/components/Toast';
import { apiClient } from '../src/data/api';
import { useSocialRepo } from '../src/data/provider';
import { requestBackendRefresh } from '../src/data/adapters/backend/refreshBus';
import { colors, radius, spacing } from '../src/theme';
import { normalizeImageUri } from '../src/utils/imageSource';

type BlockedUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
};

export default function BlockedUsersScreen() {
  const router = useRouter();
  const socialRepo = useSocialRepo();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    requestBackendRefresh({
      scopes: ['social', 'friendships', 'notifications'],
      source: 'manual',
      reason: 'blocked_users_screen_opened',
    });
  }, []);

  const blockedUsers = useMemo<BlockedUser[]>(
    () =>
      socialRepo
        .listUsers({ limit: 300 })
        .filter((user) => user.blockedByViewer === true)
        .map((user) => ({
          id: user.id,
          name: user.username,
          username: user.username,
          avatarUrl: user.avatarUrl,
        })),
    [socialRepo],
  );

  const handleUnblock = useCallback(async (id: string) => {
    if (pendingUserId) {
      return;
    }
    setPendingUserId(id);
    try {
      await apiClient.post('/api/social/unblock', {
        targetUserId: id,
        updatedAtIsoUtc: new Date().toISOString(),
      });
      requestBackendRefresh({
        scopes: ['social', 'friendships', 'notifications'],
        source: 'manual',
        reason: 'social_user_unblocked',
      });
      toast.success('User unblocked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unblock user.');
    } finally {
      setPendingUserId(null);
    }
  }, [pendingUserId]);

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
          onPress={() => {
            void handleUnblock(item.id);
          }}
          disabled={pendingUserId === item.id}
        >
          <AppText style={styles.unblockText}>
            {pendingUserId === item.id ? 'Working...' : 'Unblock'}
          </AppText>
        </Pressable>
      </View>
    );
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.headerWrap}>
        <PageHeader
          eyebrow="Moderation"
          title="Blocked Users"
          subtitle="People you have removed from your social surface."
          onBack={() => router.back()}
        />
      </View>

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
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(17,17,19,0.9)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  unblockText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
