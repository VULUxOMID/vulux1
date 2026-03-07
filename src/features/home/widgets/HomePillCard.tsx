import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useRef } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleProp, StyleSheet, UIManager, View, ViewStyle, Animated } from 'react-native';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PILL_H = 54;
const PILL_H_COMPACT = 44;
const PILL_RADIUS = 18;
const PILL_PAD_X = 16;
const PILL_PAD_X_COMPACT = 0;

type HomePillCardProps = {
  title: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  leftIconBackground?: string;
  rightContent?: ReactNode;
  collapsedContent?: ReactNode;
  onPress?: () => void;
  expanded?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  showChevron?: boolean;
  titleSuffix?: ReactNode;
  onPressIn?: () => void;
  density?: 'standard' | 'compact';
  headerHeight?: number;
};

export function HomePillCard({
  title,
  leftIcon,
  leftIconBackground,
  rightContent,
  collapsedContent,
  onPress,
  expanded,
  children,
  style,
  contentStyle,
  showChevron = true,
  titleSuffix,
  onPressIn,
  density = 'standard',
  headerHeight,
}: HomePillCardProps) {
  const isCompact = density === 'compact';
  const defaultHeight = isCompact ? PILL_H_COMPACT : PILL_H;
  const height = headerHeight ?? defaultHeight;
  const paddingX = isCompact ? PILL_PAD_X_COMPACT : PILL_PAD_X;

  // Track previous expanded state to only animate on changes
  const wasExpanded = useRef(expanded);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (wasExpanded.current !== expanded) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      wasExpanded.current = expanded;
    }
    
    if (expanded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [expanded]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  const canPressCollapsedContent = Boolean(!expanded && collapsedContent && onPress);

  return (
    <View style={[styles.container, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        style={({ pressed }) => [
          styles.header,
          { height, paddingHorizontal: paddingX },
          pressed && onPress && styles.pressed,
        ]}
      >
        <View style={styles.leftRow}>
          {leftIcon && (
            leftIconBackground ? (
              <View style={[styles.iconBackground, { backgroundColor: leftIconBackground }]}>
                <Ionicons name={leftIcon} size={isCompact ? 14 : 18} color="#FFFFFF" />
              </View>
            ) : (
              <Ionicons name={leftIcon} size={isCompact ? 16 : 20} color="#FFFFFF" />
            )
          )}
          <AppText style={[styles.titleText, isCompact && styles.titleTextCompact]}>{title}</AppText>
          {titleSuffix}
        </View>

        <View style={styles.rightRow}>
          {rightContent}
          {showChevron && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={isCompact ? 14 : 16}
              color={colors.textSecondary}
              style={styles.chevron}
            />
          )}
        </View>
      </Pressable>

      {!expanded && collapsedContent ? (
        canPressCollapsedContent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${title}`}
            onPress={handlePress}
            onPressIn={onPressIn}
            style={({ pressed }) => [styles.collapsedContent, pressed && styles.pressed]}
          >
            {collapsedContent}
          </Pressable>
        ) : (
          <View style={styles.collapsedContent}>
            {collapsedContent}
          </View>
        )
      ) : null}

      {expanded && children ? (
        <Animated.View 
          style={[
            styles.content, 
            { 
              paddingHorizontal: isCompact ? spacing.xs : paddingX, 
              paddingBottom: isCompact ? spacing.xs : paddingX,
              opacity: fadeAnim
            }, 
            contentStyle
          ]}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // height and padding set dynamically
  },
  pressed: {
    opacity: 0.85,
    backgroundColor: colors.surface,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.textPrimary,
  },
  titleTextCompact: {
    fontSize: 14,
    fontWeight: '600',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chevron: {
    marginLeft: 2,
  },
  content: {
    // padding set dynamically
  },
  collapsedContent: {
    paddingHorizontal: PILL_PAD_X,
    paddingBottom: spacing.md,
  },
  iconBackground: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

