import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, Dimensions, ActivityIndicator } from 'react-native';
import { colors, radius, spacing } from '../../../theme';
import { AppText } from '../../../components';
import { normalizeImageUri } from '../../../utils/imageSource';

type MediaPreviewProps = {
  url: string;
  type: 'image' | 'video';
  aspectRatio?: number;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function MediaPreview({ url, type, aspectRatio = 1 }: MediaPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const normalizedUrl = normalizeImageUri(url);

  // Calculate dimensions based on aspect ratio
  // Use responsive sizing based on screen width
  const screenWidth = SCREEN_W;
  const maxWidth = Math.min(200, screenWidth * 0.4); // 40% of screen width, max 200px
  const maxHeight = Math.min(180, screenWidth * 0.36); // Maintain aspect ratio
  const calculatedHeight = maxWidth / aspectRatio;
  
  // Constrain dimensions
  const width = calculatedHeight > maxHeight ? maxHeight * aspectRatio : maxWidth;
  const height = Math.min(calculatedHeight, maxHeight);

  const handlePress = () => {
    setFullscreen(true);
  };

  const handleRetry = () => {
    setError(false);
    setLoading(true);
  };

  if (error) {
    return (
      <Pressable style={[styles.container, { width, height }]} onPress={handleRetry}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color={colors.accentDanger} />
          <AppText style={styles.errorText}>Tap to retry</AppText>
        </View>
      </Pressable>
    );
  }

  if (!normalizedUrl) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="image-outline" size={24} color={colors.textMuted} />
          <AppText style={styles.errorText}>Media unavailable</AppText>
        </View>
      </View>
    );
  }

  return (
    <>
      <Pressable style={[styles.container, { width, height }]} onPress={handlePress}>
        <Image
          source={{ uri: normalizedUrl }}
          style={styles.image}
          resizeMode="cover"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
        {type === 'video' && (
          <View style={styles.playOverlay}>
            <View style={styles.playButton}>
              <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </View>
        )}
      </Pressable>

      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fullscreenContainer}>
          <Pressable style={styles.closeButton} onPress={() => setFullscreen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          
          <Image
            source={{ uri: normalizedUrl }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: spacing.xs,
  },
  errorText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    maxWidth: SCREEN_W * 0.9,
    maxHeight: SCREEN_H * 0.8,
    borderRadius: radius.md,
  },
});
