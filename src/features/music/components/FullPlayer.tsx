import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Modal, Dimensions, ActivityIndicator, ScrollView, Animated, GestureResponderEvent, PanResponder } from 'react-native';
import Slider from '@react-native-community/slider';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import { useMusic } from '../context/MusicContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const PENDULUM_SPRING = {
  tension: 40,
  friction: 6,
  useNativeDriver: true,
};

const formatTime = (millis: number) => {
  if (!millis || millis < 0) return '0:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

type ViewMode = 'artwork' | 'lyrics' | 'queue';

export const FullPlayer = () => {
  const { 
    currentTrack, 
    isPlaying, 
    isBuffering,
    togglePlayPause, 
    minimized, 
    setMinimized,
    position,
    duration,
    seekTo,
    playNext,
    playPrevious,
    shuffleMode,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    toggleLikeTrack,
    likedTrackIds,
    queue,
    currentIndex,
    playTrack,
    openActionMenu
  } = useMusic();
  
  const insets = useSafeAreaInsets();
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('artwork');
  
  // Gesture handling - use refs to ensure stability
  const translateYRef = useRef(new Animated.Value(0));
  const translateXRef = useRef(new Animated.Value(0));
  const translateY = translateYRef.current;
  const translateX = translateXRef.current;
  
  // Touch tracking refs
  const swipeStartY = useRef(0);
  const swipeStartTime = useRef(0);
  const swipeStartX = useRef(0);
  const swipeStartTimeX = useRef(0);
  
  // Refs to hold latest functions to avoid stale closures
  const setMinimizedRef = useRef(setMinimized);
  const playNextRef = useRef(playNext);
  const playPreviousRef = useRef(playPrevious);
  
  // Update refs on every render
  setMinimizedRef.current = setMinimized;
  playNextRef.current = playNext;
  playPreviousRef.current = playPrevious;
  
  // Vertical swipe handlers (for minimize)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Stop any running animation
        translateYRef.current?.stopAnimation?.();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYRef.current?.setValue?.(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || (gestureState.dy > 30 && gestureState.vy > 0.3)) {
          Animated.timing(translateYRef.current, {
            toValue: Dimensions.get('window').height,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setMinimizedRef.current(true);
          });
        } else {
          Animated.spring(translateYRef.current, {
            toValue: 0,
            velocity: gestureState.vy,
            ...PENDULUM_SPRING,
          }).start();
        }
      }
    })
  ).current;
  
  // Horizontal swipe handlers (for track change)
  const onHorizontalResponderGrant = (e: GestureResponderEvent) => {
    swipeStartX.current = e.nativeEvent.pageX;
    swipeStartTimeX.current = Date.now();
  };
  
  const onHorizontalResponderMove = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - swipeStartX.current;
    translateXRef.current?.setValue?.(dx);
  };
  
  const onHorizontalResponderRelease = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - swipeStartX.current;
    const dur = Date.now() - swipeStartTimeX.current;
    const rawVelocity = dx / Math.max(dur, 1);
    const velocity = Math.abs(rawVelocity);
    
    if (dx < -60 || (dx < -30 && velocity > 0.3)) {
      Animated.spring(translateXRef.current, {
        toValue: -width,
        velocity: rawVelocity,
        ...PENDULUM_SPRING,
      }).start(() => {
        playNextRef.current(false);
        translateXRef.current?.setValue?.(0);
      });
    } else if (dx > 60 || (dx > 30 && velocity > 0.3)) {
      Animated.spring(translateXRef.current, {
        toValue: width,
        velocity: rawVelocity,
        ...PENDULUM_SPRING,
      }).start(() => {
        playPreviousRef.current();
        translateXRef.current?.setValue?.(0);
      });
    } else {
      Animated.spring(translateXRef.current, {
        toValue: 0,
        velocity: rawVelocity,
        ...PENDULUM_SPRING,
      }).start();
    }
  };

  // Reset translateY when player opens
  useEffect(() => {
    if (!minimized && translateYRef.current) {
      // Use requestAnimationFrame to ensure smooth reset
      requestAnimationFrame(() => {
        translateYRef.current?.setValue?.(0);
      });
    }
  }, [minimized]);

  // Update slider value from position when not seeking
  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(position);
    }
  }, [position, isSeeking]);

  if (!currentTrack) return null;

  const handleSlidingStart = () => {
    setIsSeeking(true);
  };

  const handleSlidingComplete = async (value: number) => {
    await seekTo(value);
    setIsSeeking(false);
  };

  const getRepeatIcon = () => {
    switch (repeatMode) {
      case 'one': return 'repeat';
      case 'all': return 'repeat';
      default: return 'repeat';
    }
  };

  const getRepeatColor = () => {
    return repeatMode === 'off' ? colors.textMuted : colors.accentPrimary;
  };

  const isLiked = likedTrackIds.has(currentTrack.id);

  const cycleViewMode = () => {
    setViewMode(current => {
      if (current === 'artwork') return 'lyrics';
      if (current === 'lyrics') return 'queue';
      return 'artwork';
    });
  };

  const renderCenterContent = () => {
    switch (viewMode) {
      case 'lyrics':
        return (
          <View style={styles.lyricsContainer}>
            <AppText style={styles.lyricsHeader}>Lyrics</AppText>
            <ScrollView style={styles.lyricsScroll} showsVerticalScrollIndicator={false}>
              <AppText style={styles.lyricsText}>
                {currentTrack.lyrics || "No lyrics available for this track."}
              </AppText>
            </ScrollView>
          </View>
        );
      case 'queue':
        return (
          <View style={styles.queueContainer}>
            <AppText style={styles.queueHeader}>Up Next</AppText>
            <ScrollView style={styles.queueScroll} showsVerticalScrollIndicator={false}>
              {queue.slice(currentIndex + 1).map((track, index) => (
                <TouchableOpacity 
                  key={`${track.id}-${index}`} 
                  style={styles.queueItem}
                  onPress={() => playTrack(track, queue)}
                >
                  <Image source={{ uri: track.artwork }} style={styles.queueArtwork} resizeMode="cover" />
                  <View style={styles.queueInfo}>
                    <AppText style={styles.queueTitle} numberOfLines={1}>{track.title}</AppText>
                    <AppText style={styles.queueArtist} numberOfLines={1}>{track.artist}</AppText>
                  </View>
                </TouchableOpacity>
              ))}
              {queue.length <= currentIndex + 1 && (
                <AppText style={styles.emptyQueueText}>End of queue</AppText>
              )}
            </ScrollView>
          </View>
        );
      case 'artwork':
      default:
        return (
          <View style={styles.artworkContainer}>
            <Image 
              source={{ uri: currentTrack.artwork }} 
              style={styles.artwork} 
              resizeMode="cover"
            />
          </View>
        );
    }
  };

  const getViewModeIcon = () => {
    if (viewMode === 'artwork') return 'text'; // Show text icon to go to lyrics
    if (viewMode === 'lyrics') return 'list'; // Show list icon to go to queue
    return 'image'; // Show image icon to go to artwork
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={!minimized}
      onRequestClose={() => setMinimized(true)}
    >
      <Animated.View 
        style={[styles.container, { transform: [{ translateY }] }]}
      >
        <View style={styles.background}>
           <Image source={{ uri: currentTrack.artwork }} style={styles.backgroundImage} blurRadius={50} />
           <View style={styles.overlay} />
        </View>

        <View style={[styles.content, { paddingTop: insets.top }]}>
          {/* Swipeable Header Area - drag down to minimize */}
          <View 
            style={styles.swipeableHeader}
            {...panResponder.panHandlers}
          >
            <View style={styles.swipeIndicator} />
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setMinimized(true)} style={styles.headerButton}>
                <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <AppText style={styles.headerTitle}>
                {viewMode === 'queue' ? 'Queue' : viewMode === 'lyrics' ? 'Lyrics' : 'Now Playing'}
              </AppText>
              <TouchableOpacity 
                style={styles.headerButton}
                onPress={() => openActionMenu(currentTrack)}
              >
                 <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Center Content - Swipeable for track changes */}
          <View style={styles.centerContainer}>
            <Animated.View 
              style={[styles.centerSwipeArea, { transform: [{ translateX }] }]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={onHorizontalResponderGrant}
              onResponderMove={onHorizontalResponderMove}
              onResponderRelease={onHorizontalResponderRelease}
            >
              {renderCenterContent()}
            </Animated.View>
          </View>

          {/* Track Info */}
          <View style={styles.trackInfo}>
            <View style={{flex: 1, marginRight: 16}}>
              <AppText style={styles.title} numberOfLines={1}>{currentTrack.title}</AppText>
              <AppText style={styles.artist} numberOfLines={1}>{currentTrack.artist}</AppText>
            </View>
            <View style={styles.trackActions}>
              <TouchableOpacity onPress={cycleViewMode} style={styles.actionButton}>
                <Ionicons 
                  name={getViewModeIcon() as any} 
                  size={24} 
                  color={viewMode !== 'artwork' ? colors.accentPrimary : colors.textMuted} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => toggleLikeTrack(currentTrack.id)}
              >
                <Ionicons 
                  name={isLiked ? "heart" : "heart-outline"} 
                  size={28} 
                  color={isLiked ? colors.accentPrimary : colors.textPrimary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
             <Slider
               style={{width: '100%', height: 40}}
               minimumValue={0}
               maximumValue={duration || 1} // Avoid 0
               value={seekValue}
               minimumTrackTintColor={colors.textPrimary}
               maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
               thumbTintColor={colors.textPrimary}
               onSlidingStart={handleSlidingStart}
               onSlidingComplete={handleSlidingComplete}
               onValueChange={setSeekValue}
             />
             <View style={styles.timeRow}>
               <AppText style={styles.timeText}>{formatTime(seekValue)}</AppText>
               <AppText style={styles.timeText}>{formatTime(duration)}</AppText>
             </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity onPress={toggleShuffle}>
              <Ionicons 
                name="shuffle" 
                size={24} 
                color={shuffleMode ? colors.accentPrimary : colors.textMuted} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={playPrevious}>
               <Ionicons name="play-skip-back" size={32} color={colors.textPrimary} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.playButton}
              onPress={togglePlayPause}
            >
              {isBuffering ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={36} 
                  color={colors.background} 
                  style={{ marginLeft: isPlaying ? 0 : 4 }}
                />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => playNext(false)}>
               <Ionicons name="play-skip-forward" size={32} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleRepeat}>
               <View>
                 <Ionicons name={getRepeatIcon() as any} size={24} color={getRepeatColor()} />
                 {repeatMode === 'one' && (
                   <AppText style={styles.repeatOneBadge}>1</AppText>
                 )}
               </View>
            </TouchableOpacity>
          </View>
          
          <View style={{ height: insets.bottom + 20 }} />
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  swipeableHeader: {
    alignItems: 'center',
    paddingTop: 12,
    marginBottom: 16,
  },
  swipeIndicator: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 44,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  centerContainer: {
    alignItems: 'center',
    marginBottom: 40,
    height: width - 64,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  centerSwipeArea: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkContainer: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.44,
    shadowRadius: 10.32,
    elevation: 16,
  },
  artwork: {
    width: width - 48,
    height: width - 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  lyricsContainer: {
    width: width - 48,
    height: width - 48,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 24,
  },
  lyricsHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsText: {
    fontSize: 18,
    lineHeight: 28,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  queueContainer: {
    width: width - 48,
    height: width - 48,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 24,
  },
  queueHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  queueScroll: {
    flex: 1,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  queueArtwork: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    marginRight: 12,
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  queueArtist: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyQueueText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
  trackInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginLeft: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  artist: {
    fontSize: 18,
    color: colors.textMuted,
  },
  progressContainer: {
    marginBottom: 40,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
    borderRadius: 2,
    position: 'relative',
  },
  knob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.textPrimary,
    position: 'absolute',
    right: -6,
    top: -4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repeatOneBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.accentPrimary,
  },
});
