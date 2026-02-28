import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  Modal, 
  Switch, 
  Pressable, 
  ScrollView, 
  Linking, 
  Animated, 
  Dimensions, 
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

type NotificationSettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

type SettingItem = {
  id: string;
  label: string;
  value: boolean;
  icon: string;
};

type SettingSection = {
  title: string;
  items: SettingItem[];
};

const STORAGE_KEY = 'notification_settings_v1';

const DEFAULT_SECTIONS: SettingSection[] = [
  {
    title: 'Social',
    items: [
      { id: 'friend_requests', label: 'Friend Requests', value: true, icon: 'people' },
      { id: 'direct_messages', label: 'Direct Messages', value: true, icon: 'chatbubble' },
      { id: 'mentions', label: 'Mentions', value: true, icon: 'at' },
    ],
  },
  {
    title: 'Live & Events',
    items: [
      { id: 'friend_goes_live', label: 'Friend Goes Live', value: true, icon: 'radio' },
      { id: 'events', label: 'Events', value: true, icon: 'calendar' },
    ],
  },
  {
    title: 'Money',
    items: [
      { id: 'receive_cash', label: 'Receive Cash', value: true, icon: 'cash' },
      { id: 'withdrawals', label: 'Withdrawals', value: true, icon: 'wallet' },
    ],
  },
  {
    title: 'Other',
    items: [
      { id: 'announcements', label: 'Announcements', value: true, icon: 'megaphone' },
      { id: 'streak_reminder', label: 'Streak Reminder', value: true, icon: 'flame' },
    ],
  },
];

const normalizeSections = (stored: SettingSection[] | null): SettingSection[] => {
  if (!stored) return DEFAULT_SECTIONS;
  const valueMap = new Map<string, boolean>();
  stored.forEach(section => {
    section.items.forEach(item => {
      valueMap.set(item.id, item.value);
    });
  });

  return DEFAULT_SECTIONS.map(section => ({
    ...section,
    items: section.items.map(item => ({
      ...item,
      value: valueMap.get(item.id) ?? item.value,
    })),
  }));
};

export function NotificationSettingsModal({ visible, onClose }: NotificationSettingsModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [sections, setSections] = useState<SettingSection[]>(DEFAULT_SECTIONS);
  const didHydrate = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let isActive = true;
    didHydrate.current = false;

    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isActive) return;
        if (stored) {
          const parsed = JSON.parse(stored) as SettingSection[];
          setSections(normalizeSections(parsed));
        } else {
          setSections(DEFAULT_SECTIONS);
        }
      } catch {
        if (isActive) setSections(DEFAULT_SECTIONS);
      } finally {
        if (isActive) didHydrate.current = true;
      }
    };

    load();
    return () => {
      isActive = false;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !didHydrate.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  }, [sections, visible]);

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
      slideAnim.setValue(SHEET_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const handleClose = () => {
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

  const toggleSetting = (id: string) => {
    setSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item =>
        item.id === id ? { ...item, value: !item.value } : item
      ),
    })));
  };

  const handleSystemSettings = () => {
    Linking.openSettings();
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
            <AppText style={styles.title}>Notification Settings</AppText>
          </View>

          {/* Settings Content */}
          <View style={styles.content}>
            <ScrollView 
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {sections.map((section) => (
                <View key={section.title} style={styles.section}>
                  <AppText style={styles.sectionTitle}>{section.title}</AppText>
                  <View style={styles.card}>
                    {section.items.map((item, index) => (
                      <View key={item.id}>
                        <View style={styles.row}>
                          <View style={styles.rowLeft}>
                            <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                            <AppText style={styles.label}>{item.label}</AppText>
                          </View>
                          <Switch
                            value={item.value}
                            onValueChange={() => toggleSetting(item.id)}
                            trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.accentPrimary }}
                            thumbColor="#fff"
                            ios_backgroundColor="rgba(255,255,255,0.1)"
                          />
                        </View>
                        {index < section.items.length - 1 && <View style={styles.divider} />}
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              <View style={styles.section}>
                <AppText style={styles.sectionTitle}>System</AppText>
                <Pressable style={styles.systemCard} onPress={handleSystemSettings}>
                  <AppText style={styles.systemLabel}>Get notifications outside of Vulu.</AppText>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
            </ScrollView>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 20,
  },
  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  systemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
});
