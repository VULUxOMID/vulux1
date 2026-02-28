import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View, Image, Pressable } from 'react-native';

import { AppText } from '../../../components';
import type { SocialUser } from '../../../data/contracts';
import { colors, radius, spacing } from '../../../theme';
import { normalizeImageUri } from '../../../utils/imageSource';

interface NewFriendsWidgetProps {
  suggestions: SocialUser[];
  onAddFriend: (user: SocialUser) => void;
  onPressProfile?: (user: SocialUser) => void;
}

export function NewFriendsWidget({ suggestions, onAddFriend, onPressProfile }: NewFriendsWidgetProps) {
  if (!suggestions.length) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="h2" style={styles.title}>New friends</AppText>
      </View>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.map((user) => {
          const avatarUri = normalizeImageUri(user.avatarUrl);
          return (
            <Pressable
              key={user.id}
              style={styles.card}
              onPress={() => {
                if (onPressProfile) {
                  onPressProfile(user);
                  return;
                }
                onAddFriend(user);
              }}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.image} />
              ) : (
                <View style={styles.fallbackImage}>
                  <Ionicons name="person" size={30} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.overlay} />

              <View style={styles.info}>
                <AppText style={styles.username} numberOfLines={1}>
                  {user.username}
                </AppText>

                <Pressable
                  style={({ pressed }) => [
                    styles.addButton,
                    pressed && styles.addButtonPressed,
                  ]}
                  onPress={() => onAddFriend(user)}
                >
                  <Ionicons name="add" size={20} color={colors.textPrimary} />
                </Pressable>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    width: 120,
    height: 160,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    alignItems: 'center',
  },
  username: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginBottom: spacing.xs,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    // backdropFilter: 'blur(10px)', // removed web-only property
  },
  addButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
