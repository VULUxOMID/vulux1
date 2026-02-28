import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, PanResponder, Animated } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useVideo } from '../../../context/VideoContext';
import { colors } from '../../../theme';
import { normalizeImageUri } from '../../../utils/imageSource';

const MINI_PLAYER_WIDTH = 120;
const MINI_PLAYER_HEIGHT = 180; // Portrait aspect ratio
const MARGIN = 16;

export const VideoMiniPlayer = () => {
  const router = useRouter();
  const { activeVideo, isMinimized, maximizeVideo, closeVideo, playbackPosition, updatePlaybackPosition } = useVideo();
  const playbackPositionRef = useRef(playbackPosition);
  const videoSourceUri = useMemo(() => normalizeImageUri(activeVideo?.videoUrl), [activeVideo?.videoUrl]);
  const videoPlayer = useVideoPlayer(videoSourceUri ? { uri: videoSourceUri } : null, (player) => {
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.25;
  });
  
  // Draggable position
  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    playbackPositionRef.current = playbackPosition;
  }, [playbackPosition]);

  // PanResponder for drag gestures
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value
        });
        pan.setValue({ x: 0, y: 0 });
        setIsDragging(true);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        setIsDragging(false);
        
        // Snap to edges logic could go here
      }
    })
  ).current;

  useEffect(() => {
    if (!activeVideo || !isMinimized || !videoSourceUri) {
      videoPlayer.pause();
      return;
    }
    videoPlayer.currentTime = Math.max(0, playbackPositionRef.current / 1000);
    videoPlayer.play();
  }, [activeVideo?.id, isMinimized, videoPlayer, videoSourceUri]);

  useEffect(() => {
    const timeSub = videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
      updatePlaybackPosition(Math.max(0, Math.floor(currentTime * 1000)));
    });
    const endSub = videoPlayer.addListener('playToEnd', () => {
      videoPlayer.pause();
    });
    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [updatePlaybackPosition, videoPlayer]);

  const handlePress = () => {
    if (!isDragging) {
      maximizeVideo();
      // Navigate back to the video screen
      router.push({
        pathname: '/video/[id]',
        params: { id: activeVideo?.id }
      } as any);
    }
  };

  const handleClose = () => {
    closeVideo();
  };

  if (!activeVideo || !isMinimized) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }]
        }
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable onPress={handlePress} style={styles.contentContainer}>
        {videoSourceUri ? (
          <VideoView
            style={styles.video}
            player={videoPlayer}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          <View style={[styles.video, styles.videoFallback]}>
            <Ionicons name="videocam-off" size={20} color={colors.textMuted} />
          </View>
        )}
        
        {/* Controls Overlay */}
        <View style={styles.overlay}>
            <Pressable onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={16} color="#FFF" />
            </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above bottom tab bar
    right: MARGIN,
    width: MINI_PLAYER_WIDTH,
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#000',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    zIndex: 9999,
    overflow: 'hidden',
  },
  contentContainer: {
    flex: 1,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 8,
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
