import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { toast } from '../src/components/Toast';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';
import { resolveSessionGate } from '../src/auth/sessionGate';
import { useFriends } from '../src/context';
import { useProfile } from '../src/context/ProfileContext';
import type { LiveUser } from '../src/features/liveroom/types';
import { colors, radius, spacing } from '../src/theme';

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export default function FriendsScreen() {
  const router = useRouter();
  const {
    userId,
    hasSession,
    isLoaded: isAuthLoaded,
    isSignedIn,
  } = useSessionAuth();
  const sessionGate = resolveSessionGate({
    isAuthLoaded,
    hasSession,
    isSignedIn,
    userId,
  });
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
    if (!sessionGate.hasAuthenticatedSession) {
      toast.error(
        sessionGate.shouldShowSignInRequired
          ? 'Sign in required to open direct messages.'
          : 'Preparing your session...',
      );
      return;
    }
    const normalizedFriendId = friendId.trim();
    if (!normalizedFriendId) return;
    router.push(`/chat/${encodeURIComponent(normalizedFriendId)}`);
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="h2">Friends</AppText>
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
      </View>

      <FlatList
        data={sortedFriends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppText style={styles.emptyTitle}>No friends yet</AppText>
            <AppText variant="small" secondary style={styles.emptySubtitle}>
              Add friends from the Chat search to see them here.
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rowPressed: {
    opacity: 0.78,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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
    paddingVertical: spacing.xl * 2,
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
