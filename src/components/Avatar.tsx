import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type AvatarProps = {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  customSize?: number;
  borderColor?: string;
  borderWidth?: number;
  accessibilityLabel?: string;
};

const SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 38,
  md: 40,
  lg: 56,
  xl: 128,
};

export function Avatar({
  uri,
  name = 'User',
  size = 'md',
  customSize,
  borderColor,
  borderWidth = 0,
  accessibilityLabel,
}: AvatarProps) {
  const [hasError, setHasError] = useState(false);

  const dimension = customSize ?? SIZES[size];
  const borderRadius = dimension / 2;

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getBackgroundColor = (name: string) => {
    const charCode = name.charCodeAt(0);
    const hue = (charCode * 37) % 360;
    return `hsl(${hue}, 60%, 45%)`;
  };

  const bgColor = getBackgroundColor(name);

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius,
          backgroundColor: bgColor,
          borderColor: borderColor || 'transparent',
          borderWidth,
        },
      ]}
      accessibilityLabel={accessibilityLabel || `${name}'s avatar`}
    >
      {/* Initials fallback - always visible behind image */}
      <Text style={[styles.initialsText, { fontSize: dimension * 0.4 }]}>
        {getInitials(name)}
      </Text>
      
      {/* Image overlays the initials when loaded */}
      {uri && !hasError && (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: dimension - borderWidth * 2,
              height: dimension - borderWidth * 2,
              borderRadius: borderRadius - borderWidth,
            },
          ]}
          onError={() => setHasError(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  initialsText: {
    fontWeight: 'bold',
    color: 'white',
  },
});
