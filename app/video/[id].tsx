import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Dimensions, ActivityIndicator, Animated, PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useVideo } from '../../src/context/VideoContext';
import { useWallet } from '../../src/context/WalletContext';
import { toast } from '../../src/components/Toast';
import { colors, spacing, typography, radius } from '../../src/theme';
import { VideoCard } from '../../src/features/videos/components/VideoCard';
import { normalizeImageUri } from '../../src/utils/imageSource';

const { width, height } = Dimensions.get('window');
const VIDEO_HEIGHT = width * (9 / 16);
const SWIPE_THRESHOLD = 100;
const TRAILER_DURATION_MS = 15000;

export default function VideoPlayerScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const videoViewRef = useRef<VideoView>(null);
  
  const { videos, unlockVideo } = useVideo();
  const { balance } = useWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'trailer' | 'full' | null>(null);
  
  // Track playback position
  const trailerFinishedRef = useRef(false);

  // Animation values
  const slideY = useRef(new Animated.Value(0)).current; // For swipe down animation
  const backdropOpacity = slideY.interpolate({
    inputRange: [0, height * 0.6],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  
  const video = videos.find(v => v.id === id);
  const videoSourceUri = useMemo(() => normalizeImageUri(video?.videoUrl), [video?.videoUrl]);
  const thumbnailUri = useMemo(() => normalizeImageUri(video?.thumbnailUrl), [video?.thumbnailUrl]);
  const creatorAvatarUri = useMemo(() => normalizeImageUri(video?.creatorAvatar), [video?.creatorAvatar]);
  const videoPlayer = useVideoPlayer(videoSourceUri ? { uri: videoSourceUri } : null, (player) => {
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.25;
  });
  const relatedVideos = video
    ? videos
        .filter((item) => item.creatorId === video.creatorId && item.id !== video.id)
        .sort((a, b) => b.createdAt - a.createdAt)
    : [];

  // PanResponder for Swipe Down
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only trigger if swiping down significantly and not scrolling up
        return gestureState.dy > 10 && Math.abs(gestureState.dx) < 20;
      },
      onPanResponderMove: Animated.event(
        [null, { dy: slideY }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          // Swipe down detected
          handleSwipeDown();
        } else {
          // Reset position
          Animated.spring(slideY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      }
    })
  ).current;

  const handleSwipeDown = () => {
      router.back();
  };

  const stopPlayback = useCallback(() => {
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    setIsPlaying(false);
    setPlaybackMode(null);
  }, [videoPlayer]);

  // Haptic feedback helper
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => {
    switch (type) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  };

  const startPlayback = (mode: 'trailer' | 'full') => {
    if (!video || !videoSourceUri) return;

    triggerHaptic('light');
    trailerFinishedRef.current = false;
    setPlaybackMode(mode);
    setIsPlaying(true);
    videoPlayer.currentTime = 0;
    videoPlayer.play();

    if (mode === 'full') {
      requestAnimationFrame(() => {
        void videoViewRef.current?.enterFullscreen();
      });
    }
  };

  useEffect(() => {
    if (!video || video.isLocked) {
      stopPlayback();
      return;
    }
    stopPlayback();
  }, [id, stopPlayback, video]);

  useEffect(() => {
    const timeSub = videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
      if (
        playbackMode === 'trailer' &&
        currentTime * 1000 >= TRAILER_DURATION_MS &&
        !trailerFinishedRef.current
      ) {
        trailerFinishedRef.current = true;
        stopPlayback();
      }
    });
    const endSub = videoPlayer.addListener('playToEnd', () => {
      stopPlayback();
    });
    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [playbackMode, stopPlayback, videoPlayer]);

  if (!video) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Video not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const handleUnlock = async () => {
    setIsLoading(true);
    const success = await unlockVideo(video.id);
    setIsLoading(false);
    
    if (success) {
      toast.success('Video unlocked! Enjoy.');
      stopPlayback();
    } else {
      toast.warning(`You need ${video.price} ${video.currency === 'cash' ? 'Cash' : 'Gems'} to unlock this video.`);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View 
      style={[
        styles.container, 
        { paddingTop: insets.top },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }, styles.pointerEventsNone]} />
      <Animated.View style={[styles.screenContent, { transform: [{ translateY: slideY }] }]}>
      {/* Top Header Section */}
      <View style={styles.topHeader}>
        <Pressable style={styles.topBackButton} onPress={handleBack}>
          <Ionicons name="chevron-down" size={24} color="#FFF" />
        </Pressable>
      </View>

      {/* Video Player Area - Floating Card Style */}
      <View style={styles.videoWrapper}>
        <View style={styles.videoContainer}>
          {video.isLocked ? (
            <View style={styles.lockedContainer}>
              {thumbnailUri ? (
                <Image source={{ uri: thumbnailUri }} style={styles.lockedThumbnail} />
              ) : (
                <View style={[styles.lockedThumbnail, styles.videoPosterFallback]} />
              )}
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
                <View style={styles.lockContent}>
                  <Ionicons name="lock-closed" size={48} color={colors.accentWarning} />
                  <Text style={styles.lockTitle}>Premium Content</Text>
                  <Text style={styles.lockDesc}>Unlock to watch full video</Text>
                  
                  <Pressable 
                    style={styles.unlockButton} 
                    onPress={handleUnlock}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={styles.unlockText}>Unlock for {video.price} {video.currency === 'cash' ? 'Cash' : 'Gems'}</Text>
                        <Ionicons name="arrow-forward" size={16} color="#000" />
                      </>
                    )}
                  </Pressable>
                  
                  <Text style={styles.balanceText}>
                    Your Balance: {video.currency === 'cash' ? balance.cash : balance.gems} {video.currency === 'cash' ? 'Cash' : 'Gems'}
                  </Text>
                </View>
              </BlurView>
            </View>
          ) : (
            <>
              <VideoView
                ref={videoViewRef}
                style={styles.video}
                player={videoPlayer}
                nativeControls={isPlaying}
                contentFit="contain"
                onFullscreenExit={() => {
                  if (playbackMode === 'full') {
                    stopPlayback();
                  }
                }}
              />
              {!isPlaying && (
                <View style={styles.videoActionsOverlay}>
                  {thumbnailUri ? (
                    <Image source={{ uri: thumbnailUri }} style={styles.videoPoster} resizeMode="cover" />
                  ) : (
                    <View style={[styles.videoPoster, styles.videoPosterFallback]} />
                  )}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.65)']}
                    style={styles.videoActionsGradient}
                  />
                  <View style={styles.videoActionsRow}>
                    <Pressable style={styles.trailerButton} onPress={() => startPlayback('trailer')}>
                      <Ionicons name="film-outline" size={18} color="#FFF" />
                      <Text style={styles.trailerButtonText}>Trailer</Text>
                    </Pressable>
                    <Pressable style={styles.playButton} onPress={() => startPlayback('full')}>
                      <Ionicons name="play" size={18} color="#0F1117" />
                      <Text style={styles.playButtonText}>Play</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </View>

      <ScrollView style={styles.detailsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.contentPadding}>
          {/* Title */}
          <Text style={styles.title}>{video.title}</Text>
          
          {/* Action Buttons Row */}
          <View style={styles.actionRow}>
            {/* Creator Profile */}
            <View style={styles.creatorProfileInline}>
              {creatorAvatarUri ? (
                <Image source={{ uri: creatorAvatarUri }} style={styles.creatorAvatarInline} />
              ) : (
                <View style={[styles.creatorAvatarInline, styles.creatorAvatarFallback]} />
              )}
              <Text style={styles.creatorNameInline}>{video.creatorName}</Text>
            </View>
          </View>
        </View>

        {/* Next Videos */}
        <View style={styles.nextVideosSection}>
          <Text style={styles.sectionHeader}>NEXT VIDEO</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.relatedList}
          >
             {relatedVideos.map(v => (
                <VideoCard 
                  key={v.id} 
                  video={v} 
                  width={140} 
                  height={210} 
                  variant="poster" 
                />
             ))}
             {relatedVideos.length === 0 && (
                 <Text style={styles.noRelated}>No related videos found.</Text>
             )}
          </ScrollView>
        </View>
        
        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  screenContent: {
    flex: 1,
  },
  topHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.textPrimary,
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    padding: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
  backButtonText: {
    color: colors.textPrimary,
  },
  videoWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  videoContainer: {
    width: '100%',
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.58,
    shadowRadius: 16.00,
    elevation: 24,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoActionsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  videoPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  videoPosterFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  videoActionsGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  videoActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  trailerButtonText: {
    ...typography.smallBold,
    color: '#FFF',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: '#FFF',
  },
  playButtonText: {
    ...typography.smallBold,
    color: '#0F1117',
  },
  overlayBackButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  lockedContainer: {
    width: '100%',
    height: '100%',
  },
  lockedThumbnail: {
    width: '100%',
    height: '100%',
    opacity: 0.5,
  },
  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  lockTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  lockDesc: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentWarning,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
    gap: spacing.sm,
  },
  unlockText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  balanceText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  detailsContainer: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: spacing.lg,
  },
  creatorProfileInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  creatorAvatarInline: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  creatorAvatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  creatorNameInline: {
    ...typography.smallBold,
    color: colors.textPrimary,
  },
  nextVideosSection: {
    marginTop: spacing.sm,
  },
  sectionHeader: {
    ...typography.tinyBold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  relatedList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  noRelated: {
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: spacing.sm,
      marginLeft: spacing.lg,
  }
});
