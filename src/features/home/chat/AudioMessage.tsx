import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { normalizeImageUri } from '../../../utils/imageSource';

type AudioMessageProps = {
  url: string;
  duration?: number;
};

export function AudioMessage({ url, duration = 0 }: AudioMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubRef = useRef<{ remove: () => void } | null>(null);
  const normalizedUrl = normalizeImageUri(url);

  const releasePlayer = () => {
    statusSubRef.current?.remove();
    statusSubRef.current = null;
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.remove();
      playerRef.current = null;
    }
    setPlaying(false);
    setProgress(0);
  };

  useEffect(() => {
    return () => {
      releasePlayer();
    };
  }, []);

  useEffect(() => {
    releasePlayer();
    setAudioDuration(duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedUrl, duration]);

  const togglePlay = async () => {
    if (!normalizedUrl) {
      return;
    }

    if (!playerRef.current) {
      try {
        const newPlayer = createAudioPlayer(
          { uri: normalizedUrl },
          { updateInterval: 100, keepAudioSessionActive: true },
        );
        newPlayer.loop = false;

        statusSubRef.current = newPlayer.addListener('playbackStatusUpdate', (status) => {
          if (!status.isLoaded || !status.duration) return;
          const progressPercent = (status.currentTime / status.duration) * 100;
          setProgress(Math.max(0, Math.min(100, progressPercent)));
          setAudioDuration(Math.max(0, Math.floor(status.duration)));
          setPlaying(status.playing);
          if (status.didJustFinish) {
            setProgress(0);
            void newPlayer.seekTo(0);
          }
        });

        playerRef.current = newPlayer;
        setPlaying(true);
        newPlayer.play();
      } catch (error) {
        if (__DEV__) {
          console.error('Failed to load audio:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } else {
      try {
        if (playing) {
          playerRef.current.pause();
          setPlaying(false);
        } else {
          playerRef.current.play();
          setPlaying(true);
        }
      } catch (error) {
        if (__DEV__) {
          console.error('Failed to toggle playback:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.playButton} onPress={togglePlay}>
        <Ionicons 
          name={playing ? "pause" : "play"} 
          size={16} 
          color="#fff" 
          style={{ marginLeft: playing ? 0 : 2 }}
        />
      </Pressable>
      
      <View style={styles.trackContainer}>
        {/* Waveform visualization */}
        <View style={styles.waveform}>
          {[...Array(20)].map((_, i) => {
            const height = Math.max(4, Math.random() * 24);
            const isActive = (i / 20) * 100 <= progress;
            return (
              <View 
                key={i} 
                style={[
                  styles.bar, 
                  { height },
                  isActive && styles.activeBar
                ]} 
              />
            );
          })}
        </View>
        <AppText variant="small" style={styles.duration}>
          {formatTime(audioDuration)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 8,
    paddingRight: 14,
    minWidth: 180,
    maxWidth: 220,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  trackContainer: {
    flex: 1,
    gap: 4,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
  },
  bar: {
    width: 3,
    backgroundColor: colors.textMuted,
    borderRadius: 1.5,
  },
  activeBar: {
    backgroundColor: colors.accentPrimary,
  },
  duration: {
    color: colors.textMuted,
    fontSize: 10,
  },
});
