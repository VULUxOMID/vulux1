import React, { useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Dimensions, Animated, PanResponder, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components/AppText';
import { colors, spacing, radius } from '../../../theme';
import type { MusicGenre } from '../types';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - spacing.lg * 2 - CARD_GAP) / 2;
const MUSIC_GENRES: MusicGenre[] = [];

interface MusicCategoriesProps {
  onBack: () => void;
}

export const MusicCategories = ({ onBack }: MusicCategoriesProps) => {
  const translateX = useRef(new Animated.Value(0)).current;
  
  const handleBack = () => {
    // Animate out first, then call onBack
    Animated.spring(translateX, {
      toValue: width,
      tension: 40,
      friction: 6,
      useNativeDriver: true,
    }).start(() => {
      onBack();
    });
  };
  
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal swipes from the left edge
        return gestureState.dx > 10 && Math.abs(gestureState.dy) < 50 && gestureState.x0 < 30;
      },
      onPanResponderGrant: () => {
        // Stop any running animation
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow rightward swipe
        if (gestureState.dx > 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = width * 0.25;
        const velocity = gestureState.vx;
        
        if (gestureState.dx > threshold || (gestureState.dx > 50 && velocity > 0.5)) {
          // Swipe completed - go back immediately like the button
          onBack();
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            tension: 40,
            friction: 6,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <AppText style={styles.headerTitle}>Categories</AppText>
          <AppText style={styles.headerSubtitle}>Pick a vibe</AppText>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {MUSIC_GENRES.map((genre) => (
            <TouchableOpacity key={genre.id} style={styles.card} activeOpacity={0.85}>
              <Image source={{ uri: genre.image }} style={styles.cardImage} />
              <LinearGradient
                colors={genre.gradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.cardOverlay}
              />
              <View style={styles.cardContent}>
                <AppText style={styles.cardTitle}>{genre.title}</AppText>
                <AppText style={styles.cardSubtitle}>{genre.subtitle}</AppText>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.15,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
});
