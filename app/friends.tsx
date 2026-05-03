import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import { AppScreen, AppText, PageHeader } from '../src/components';
import { useFriends } from '../src/context';
import { useProfile } from '../src/context/ProfileContext';
import type { LiveUser } from '../src/features/liveroom/types';
import { colors, radius, spacing } from '../src/theme';

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export default function FriendsScreen() {
  const router = useRouter();
  const { friends } = useFriends();
  const { showProfile } = useProfile();

  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => a.name.localeCompare(b.name)),
    [friends],
  );

  const openProfile = (friendId: string) => {
    const friend = friends.find((item) => item.id === friendId);
    if (!friend) return;

    const profileUser: LiveUser = {
      id: friend.id,
      name: friend.name,
      username: friend.username ?? friend.name,
      age: 0,
      country: '',
      bio: friend.statusText ?? '',
      avatarUrl: friend.avatarUrl ?? friend.imageUrl ?? '',
      verified: false,
    };

    showProfile(profileUser);
  };

  const openChat = (friendId: string) => {
    const normalizedFriendId = friendId.trim();
    if (!normalizedFriendId) return;
    router.push(`/chat/${encodeURIComponent(normalizedFriendId)}`);
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.headerWrap}>
        <PageHeader
          eyebrow="Social"
          title="Friends"
          subtitle="People you follow most closely across Vulu."
          onBack={() => router.back()}
          actions={
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/search',
                  params: { mode: 'add_friends' },
                })
              }
              style={({ pressed }) => [styles.addButton, pressed && styles.rowPressed]}
              hitSlop={10}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.textPrimary} />
            </Pressable>
          }
        />
      </View>

      <FlatList
        data={sortedFriends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppText style={styles.emptyTitle}>No friends yet</AppText>
            <AppText variant="small" secondary style={styles.emptySubtitle}>
              Add friends from search to build your Vulu circle.
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => openProfile(item.id)}
          >
            {hasImageUri(item.avatarUrl ?? item.imageUrl) ? (
              <Image source={{ uri: item.avatarUrl ?? item.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]} />
            )}
            <View style={styles.rowMeta}>
              <AppText style={styles.name}>{item.name}</AppText>
              <AppText variant="small" secondary style={styles.handle}>
                @{item.username ?? item.id}
              </AppText>
            </View>
            <Pressable
              style={({ pressed }) => [styles.messageButton, pressed && styles.rowPressed]}
              onPress={(event) => {
                event.stopPropagation();
                openChat(item.id);
              }}
              hitSlop={8}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textPrimary} />
            </Pressable>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
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
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(17,17,19,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowPressed: {
    opacity: 0.8,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  messageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  name: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  handle: {
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
