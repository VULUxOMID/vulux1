import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

interface HyperSurgeBannerProps {
  onPress: () => void;
}

export function HyperSurgeBanner({ onPress }: HyperSurgeBannerProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <LinearGradient
        colors={['#5E38F4', '#9D4BF6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <View style={styles.iconContainer}>
           <Ionicons name="flash" size={24} color="#fff" />
        </View>
        
        <View style={styles.content}>
          <AppText style={styles.title}>Launch a HyperSurge</AppText>
          <AppText style={styles.subtitle}>
            Release four max-level Powers at once.
          </AppText>
        </View>

        <Ionicons name="chevron-forward" size={20} color="#fff" style={styles.arrow} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 16,
  },
  arrow: {
    opacity: 0.8,
  },
});
