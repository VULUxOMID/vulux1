import { ScrollView, StyleSheet, View, Image, Pressable } from 'react-native';

import { AppText } from '../../../components';
import type { SocialUser } from '../../../data/contracts';
import { colors, radius, spacing } from '../../../theme';

interface FriendsActivityStripProps {
  friends: SocialUser[];
  onPressFriend: (friend: SocialUser) => void;
}

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function FriendsActivityStrip({ friends, onPressFriend }: FriendsActivityStripProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {friends.map((friend) => {
          const isHostingLive = friend.isLive === true;
          const isOnline = friend.isOnline === true;
          return (
            <Pressable
              key={friend.id}
              style={styles.item}
              onPress={() => onPressFriend(friend)}
            >
              <View
                style={[
                  styles.avatarContainer,
                  isHostingLive
                    ? styles.redBorder
                    : isOnline
                      ? styles.blueBorder
                      : styles.recentBorder,
                ]}
              >
                {hasImageUri(friend.avatarUrl) ? (
                  <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]} />
                )}
              </View>
              <AppText
                variant="tiny"
                style={styles.name}
                numberOfLines={1}
              >
                {friend.username}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 3,
    padding: 3,
    marginBottom: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redBorder: {
    borderColor: '#FF4458', // Same red as ActivitiesRow
  },
  blueBorder: {
    borderColor: '#0052FF', // Same blue as ActivitiesRow
  },
  recentBorder: {
    borderColor: 'rgba(255,255,255,0.28)',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  name: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 12,
  },
});
