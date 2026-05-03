import {
  ScrollView,
  StyleSheet,
  View,
  Image,
  Pressable,
  Animated,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';

import { AppText } from '../../components';
import { colors, spacing } from '../../theme';
import { ActivitiesRowSkeleton } from './components/ActivitiesRowSkeleton';

export type FriendStatus = 'live' | 'online' | 'busy' | 'offline' | 'recent';

export type Friend = {
  id: string;
  name: string;
  status: FriendStatus;
  imageUrl?: string;
  liveId?: string;
};

const STATUS_PRIORITY: Record<FriendStatus, number> = {
  live: 0,
  online: 1,
  busy: 2,
  recent: 3,
  offline: 4,
};

const RING_COLORS: Record<FriendStatus, string> = {
  live: '#FF4458', // Urgent Red
  online: '#007AFF', // Vibrant Neon Blue
  busy: colors.accentDanger,
  offline: 'rgba(255,255,255,0.2)',
  recent: 'rgba(255,255,255,0.28)',
};

export function ActivitiesRow({
  friends,
  onFriendPress,
  loading = false,
}: {
  friends: Friend[];
  onFriendPress?: (friend: Friend) => void;
  loading?: boolean;
}) {
  // Show skeleton while loading (must be after all hooks)
  if (loading) {
    return <ActivitiesRowSkeleton />;
  }

  if (!friends || friends.length === 0) {
    return null;
  }

  // Sort friends: Live > Online > Recent
  const sortedFriends = [...friends].sort((a, b) => {
    return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  });

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={64 + spacing.md}
        snapToAlignment="start"
        decelerationRate="fast"
        scrollEnabled={true}
      >
        {/* Friends list */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {sortedFriends.map((friend) => (
            <ActivityItem
              key={friend.id}
              friend={friend}
              onPress={() => onFriendPress?.(friend)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ActivityItem({ friend, onPress }: { friend: Friend; onPress?: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(scaleAnim, {
      toValue: 0.95, // Subtle squeeze
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };

  const ringColor = RING_COLORS[friend.status];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.itemContainer}
    >
      <View style={styles.avatarWrapper}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {/* Avatar Image with Border */}
          <View
            style={[
              styles.avatarContainer,
              {
                borderColor: ringColor,
              },
            ]}
          >
            {friend.imageUrl ? (
              <Image
                source={{
                  uri: friend.imageUrl,
                }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatarImage, styles.avatarFallback]} />
            )}
          </View>
        </Animated.View>
      </View>

      <AppText
        variant="tiny"
        style={styles.nameText}
        numberOfLines={1}
      >
        {friend.name}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginTop: spacing.xs,
    zIndex: 1,
  },
  scrollContent: {
    paddingVertical: spacing.xs,
    alignItems: 'flex-start',
  },
  itemContainer: {
    alignItems: 'center',
    width: 60,
    gap: spacing.xs,
  },
  avatarWrapper: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  nameText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    color: colors.textMuted,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
});
