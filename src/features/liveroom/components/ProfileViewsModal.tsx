import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Image, 
  Pressable, 
  Modal, 
  Animated, 
  Dimensions, 
  TextInput,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { ProfileViewData, ProfileViewsModalProps } from '../types';
import { hapticTap } from '../../../utils/haptics';
import { useProfile } from '../../../context/ProfileContext';
import { formatTimeAgo } from '../../../utils/timeUtils';
import { dismissKeyboardAndBlurActiveWebElement } from '../../../utils/webRuntimeCompat';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

export function ProfileViewsModal({ 
  visible, 
  onClose, 
  totalViews,
  profileViewData,
  isPremiumUser = true,
  onUpgradePress,
}: ProfileViewsModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');
  const { showProfile } = useProfile();

  const profileData = profileViewData ?? [];

  // Filter and Sort
  const filteredData = useMemo(() => {
    let data = [...profileData];
    // Sort by recent
    data.sort((a, b) => b.viewedAt - a.viewedAt);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      data = data.filter(item => 
        item.user.name.toLowerCase().includes(query) ||
        item.user.username.toLowerCase().includes(query)
      );
    }
    
    return data;
  }, [profileData, searchQuery]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 150,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      dismissKeyboardAndBlurActiveWebElement();
      slideAnim.setValue(SHEET_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [fadeAnim, slideAnim, visible]);

  const handleClose = () => {
    dismissKeyboardAndBlurActiveWebElement();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const handleViewerPress = (viewer: ProfileViewData) => {
    if (!isPremiumUser) {
      onUpgradePress?.();
      return;
    }
    hapticTap();
    dismissKeyboardAndBlurActiveWebElement();
    onClose();
    setTimeout(() => showProfile(viewer.user), 150);
  };

  // Pan Responder for drag-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150 || gestureState.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 150,
          }).start();
        }
      },
    })
  ).current;

  // Interaction blocker for free users
  const blockerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (!isPremiumUser) {
          onUpgradePress?.();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View 
          style={[
            styles.sheet, 
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          
          {/* Header & Drag Handle */}
          <View {...panResponder.panHandlers} style={styles.header}>
            <View style={styles.dragHandle} />
            <View style={styles.headerContent}>
              <AppText style={styles.title}>Profile Views</AppText>
              <View style={styles.badge}>
                <Ionicons name="eye" size={14} color="#000" />
                <AppText style={styles.badgeText}>{totalViews || filteredData.length}</AppText>
              </View>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search viewers..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* List Content */}
          <View style={styles.content}>
            <ScrollView 
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              scrollEnabled={isPremiumUser}
            >
              <View style={styles.listSection}>
                {filteredData.map((viewer) => (
                  <Pressable 
                    key={viewer.user.id}
                    style={styles.listItem}
                    onPress={() => handleViewerPress(viewer)}
                  >
                    <View style={styles.avatarContainer}>
                      {viewer.user.avatarUrl?.trim() ? (
                        <Image source={{ uri: viewer.user.avatarUrl }} style={styles.listAvatar} />
                      ) : (
                        <View style={styles.listAvatarPlaceholder}>
                          <Ionicons name="person" size={16} color={colors.textMuted} />
                        </View>
                      )}
                      {!isPremiumUser && (
                        <BlurView intensity={30} tint="dark" style={styles.blurOverlay} />
                      )}
                    </View>
                    <View style={styles.listInfo}>
                      <View style={styles.nameRow}>
                        <View style={styles.textWrapper}>
                          <AppText style={styles.listName}>
                            {viewer.user.name}
                          </AppText>
                          {!isPremiumUser && (
                            <BlurView intensity={30} tint="dark" style={styles.blurOverlay} />
                          )}
                        </View>
                      </View>
                      <View style={styles.textWrapper}>
                        <AppText style={styles.listTime}>
                          {`@${viewer.user.username} • ${formatTimeAgo(viewer.viewedAt)}`}
                        </AppText>
                        {!isPremiumUser && (
                          <BlurView intensity={30} tint="dark" style={styles.blurOverlay} />
                        )}
                      </View>
                    </View>
                    <View style={styles.listRight}>
                      <View style={styles.viewCountPill}>
                        <Ionicons name="eye" size={12} color={colors.accentPrimary} />
                        <AppText style={styles.viewCountText}>{viewer.viewCount}</AppText>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Interaction blocker for free users */}
            {!isPremiumUser && (
              <View 
                style={StyleSheet.absoluteFill} 
                {...blockerPanResponder.panHandlers}
              />
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: '#12121a',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 16,
    gap: 12,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 16,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activeTab: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#000',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  listSection: {
    paddingHorizontal: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: '#2a2a3a',
  },
  listAvatar: {
    width: '100%',
    height: '100%',
  },
  listAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a3a',
  },
  listInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  listName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  listRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  topSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 10,
  },
  topCard: {
    width: (SCREEN_WIDTH - 40) / 2 - 5,
    marginBottom: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  topCardGradient: {
    padding: 16,
    alignItems: 'center',
  },
  rankBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rankText: {
    color: colors.accentPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  topAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.accentPrimary,
  },
  topName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  viewCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `rgba(${parseInt(colors.accentPrimary.slice(1, 3), 16)}, ${parseInt(colors.accentPrimary.slice(3, 5), 16)}, ${parseInt(colors.accentPrimary.slice(5, 7), 16)}, 0.1)`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  viewCountText: {
    color: colors.accentPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  textWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
});
