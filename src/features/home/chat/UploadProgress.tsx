import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type UploadProgressProps = {
  progress: number; // 0 to 100
  error?: boolean;
};

export function UploadProgress({ progress, error }: UploadProgressProps) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  if (error) {
    return (
      <View style={styles.container}>
        <AppText style={styles.errorText}>Upload failed</AppText>
      </View>
    );
  }

  const width = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width }]} />
      </View>
      <AppText style={styles.text}>Sending...</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingVertical: 4,
  },
  progressBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 100,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: 2,
  },
  text: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  errorText: {
    color: colors.accentDanger,
    fontSize: 11,
    fontWeight: '500',
  },
});
