import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  Animated,
  type StyleProp,
  type ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LiveUser } from '../types';
import { hapticTap } from '../../../utils/haptics';

type StreamersDisplayProps = {
  streamers: LiveUser[];
  onStreamerTap: (user: LiveUser) => void;
  speakingUserIds?: string[]; // IDs of users currently speaking
};

function AvatarSurface({ uri, style }: { uri?: string; style: StyleProp<ImageStyle> }) {
  const normalizedUri = uri?.trim();
  if (!normalizedUri) {
    return (
      <View style={[style, styles.avatarFallback]}>
        <Ionicons name="person" size={18} color={colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri: normalizedUri }} style={style} />;
}

export function StreamersDisplay({ 
  streamers, 
  onStreamerTap,
  speakingUserIds = [],
}: StreamersDisplayProps) {
  const count = streamers.length;

  if (count === 0) {
    return (
      <View style={styles.emptyContainer}>
        <AppText style={styles.emptyText}>No streamers</AppText>
      </View>
    );
  }

  if (count === 1) {
    return (
      <SingleStreamer 
        streamer={streamers[0]} 
        onTap={() => onStreamerTap(streamers[0])}
        isSpeaking={speakingUserIds.includes(streamers[0].id)}
      />
    );
  }

  if (count === 2) {
    return (
      <View style={styles.dualContainer}>
        {streamers.map((streamer) => (
          <DualStreamer 
            key={streamer.id} 
            streamer={streamer} 
            onTap={() => onStreamerTap(streamer)}
            isSpeaking={speakingUserIds.includes(streamer.id)}
          />
        ))}
      </View>
    );
  }

  // 3+ streamers: Grid layout
  return (
    <View style={styles.gridContainer}>
      {streamers.slice(0, 4).map((streamer, index) => (
        <GridStreamer 
          key={streamer.id} 
          streamer={streamer}
          onTap={() => onStreamerTap(streamer)}
          showMore={index === 3 && count > 4}
          moreCount={count - 4}
          isSpeaking={speakingUserIds.includes(streamer.id)}
        />
      ))}
    </View>
  );
}

// Subtle border pulse animation hook
function useBorderPulse(isSpeaking: boolean) {
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isSpeaking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 0.4, duration: 250, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      opacityAnim.setValue(1);
      return undefined;
    }
  }, [isSpeaking]);

  return { opacityAnim };
}

function SingleStreamer({ 
  streamer, 
  onTap,
  isSpeaking = false,
}: { 
  streamer: LiveUser; 
  onTap: () => void;
  isSpeaking?: boolean;
}) {
  const { opacityAnim } = useBorderPulse(isSpeaking);

  return (
    <Pressable style={styles.singleContainer} onPress={onTap}>
      <View style={styles.avatarWrapper}>
        <AvatarSurface uri={streamer.avatarUrl} style={styles.avatarLargeBase} />
        <Animated.View 
          style={[
            styles.borderOverlayLarge, 
            { opacity: isSpeaking ? opacityAnim : 1 }
          ]} 
        />
        {streamer.isMuted && (
          <View style={styles.muteBadgeLarge}>
            <Ionicons name="mic-off" size={14} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.namePill}>
        <AppText style={styles.nameText}>{streamer.name}</AppText>
      </View>
    </Pressable>
  );
}

function DualStreamer({ 
  streamer, 
  onTap,
  isSpeaking = false,
}: { 
  streamer: LiveUser; 
  onTap: () => void;
  isSpeaking?: boolean;
}) {
  const { opacityAnim } = useBorderPulse(isSpeaking);

  return (
    <Pressable style={styles.dualStreamer} onPress={onTap}>
      <View style={styles.avatarWrapperMedium}>
        <AvatarSurface uri={streamer.avatarUrl} style={styles.avatarMediumBase} />
        <Animated.View 
          style={[
            styles.borderOverlayMedium, 
            { opacity: isSpeaking ? opacityAnim : 1 }
          ]} 
        />
        {streamer.isMuted && (
          <View style={styles.muteBadgeMedium}>
            <Ionicons name="mic-off" size={12} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.namePillSmall}>
        <AppText style={styles.nameTextSmall}>{streamer.name}</AppText>
      </View>
    </Pressable>
  );
}

function GridStreamer({ 
  streamer, 
  onTap,
  showMore,
  moreCount,
  isSpeaking = false,
}: { 
  streamer: LiveUser; 
  onTap: () => void;
  showMore?: boolean;
  moreCount?: number;
  isSpeaking?: boolean;
}) {
  const { opacityAnim } = useBorderPulse(isSpeaking);

  return (
    <Pressable style={styles.gridStreamer} onPress={onTap}>
      <View style={styles.avatarWrapperSmall}>
        <AvatarSurface uri={streamer.avatarUrl} style={styles.avatarSmallBase} />
        <Animated.View 
          style={[
            styles.borderOverlaySmall, 
            { opacity: isSpeaking ? opacityAnim : 1 }
          ]} 
        />
        {streamer.isMuted && (
          <View style={styles.muteBadgeSmall}>
            <Ionicons name="mic-off" size={10} color="#fff" />
          </View>
        )}
        {showMore && (
          <View style={styles.moreOverlay}>
            <AppText style={styles.moreText}>+{moreCount}</AppText>
          </View>
        )}
      </View>
      <AppText style={styles.nameTextTiny} numberOfLines={1}>{streamer.name}</AppText>
    </Pressable>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  // Single streamer
  singleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeBase: {
    width: 100,
    height: 100,
    borderRadius: 30,
  },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borderOverlayLarge: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#fff',
  },
  namePill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  nameText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Dual streamers
  dualContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.xl,
    paddingVertical: spacing.lg,
  },
  dualStreamer: {
    alignItems: 'center',
  },
  avatarWrapperMedium: {
    position: 'relative',
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMediumBase: {
    width: 80,
    height: 80,
    borderRadius: 24,
  },
  borderOverlayMedium: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  namePillSmall: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  nameTextSmall: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Grid streamers
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  gridStreamer: {
    alignItems: 'center',
    width: (width - spacing.lg * 4) / 4,
  },
  avatarWrapperSmall: {
    position: 'relative',
    marginBottom: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallBase: {
    width: 60,
    height: 60,
    borderRadius: 18,
  },
  borderOverlaySmall: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameTextTiny: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  moreText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },

  muteBadgeLarge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: colors.accentDanger,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  muteBadgeMedium: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.accentDanger,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 3,
  },
  muteBadgeSmall: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.accentDanger,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    elevation: 2,
  },
});
