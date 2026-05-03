import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useRef } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleProp, StyleSheet, UIManager, View, ViewStyle, Animated } from 'react-native';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PILL_H = 58;
const PILL_H_COMPACT = 44;
const PILL_RADIUS = 16;
const PILL_PAD_X = 16;
const PILL_PAD_X_COMPACT = 10;

type HomePillCardProps = {
  title: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  leftIconBackground?: string;
  leftIconSize?: number;
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
  leftIconSize,
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
  const resolvedIconSize = leftIconSize ?? (isCompact ? 16 : 20);

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

  const header = (
    <View
      style={[
        styles.header,
        { height, paddingHorizontal: paddingX },
      ]}
    >
      <View style={styles.leftRow}>
        {leftIcon && (
          leftIconBackground ? (
            <View style={[styles.iconBackground, { backgroundColor: leftIconBackground }]}>
              <Ionicons name={leftIcon} size={resolvedIconSize} color="#FFFFFF" />
            </View>
          ) : (
            <Ionicons name={leftIcon} size={resolvedIconSize} color="#FFFFFF" />
          )
        )}
        <AppText style={[styles.titleText, isCompact && styles.titleTextCompact]}>{title}</AppText>
        {titleSuffix}
      </View>

      <View style={styles.rightRow}>
        {rightContent}
        {showChevron && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-forward'}
            size={isCompact ? 14 : 16}
            color={colors.textSecondary}
            style={styles.chevron}
          />
        )}
      </View>
    </View>
  );

  const cardBody = (
    <>
      {expanded || !onPress ? (
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          style={({ pressed }) => [
            pressed && onPress && styles.pressed,
          ]}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}

      {!expanded && collapsedContent ? (
        <View style={styles.collapsedContent}>
          {collapsedContent}
        </View>
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
    </>
  );

  if (!expanded && onPress) {
    return (
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        style={({ pressed }) => [
          styles.container,
          style,
          pressed && styles.pressed,
        ]}
      >
        {cardBody}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {cardBody}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(17, 17, 19, 0.96)',
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // height and padding set dynamically
  },
  pressed: {
    opacity: 0.85,
    backgroundColor: colors.surfaceAlt,
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
    textTransform: 'uppercase',
    letterSpacing: -0.2,
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
    paddingBottom: spacing.smPlus,
    paddingTop: spacing.xs,
  },
  iconBackground: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
});
