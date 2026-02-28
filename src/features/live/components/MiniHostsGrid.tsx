import React, { memo, type ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '../../../components';
import { colors } from '../../../theme';

type MiniHostsGridProps = {
  hosts: Array<{ avatar?: string; avatarUrl?: string }>;
  fallbackImage?: string;
};

const resolveAvatar = (host: { avatar?: string; avatarUrl?: string }) =>
  host.avatar ?? host.avatarUrl;

function normalizeUri(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function AvatarTile({
  uri,
  style,
  children,
}: {
  uri?: string;
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const normalizedUri = normalizeUri(uri);

  return (
    <View style={[style, !normalizedUri && styles.placeholderTile]}>
      {normalizedUri ? (
        <Image source={{ uri: normalizedUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : null}
      {children}
    </View>
  );
}

function MiniHostsGridComponent({ hosts, fallbackImage }: MiniHostsGridProps) {
  const count = hosts.length;
  const normalizedFallbackImage = normalizeUri(fallbackImage);

  const hostUriAt = (index: number): string | undefined =>
    normalizeUri(resolveAvatar(hosts[index])) ?? normalizedFallbackImage;

  if (count === 0) {
    return <AvatarTile uri={normalizedFallbackImage} style={styles.miniImageFull} />;
  }

  if (count === 1) {
    return <AvatarTile uri={hostUriAt(0)} style={styles.miniImageFull} />;
  }

  if (count === 2) {
    return (
      <View style={styles.splitCol}>
        <AvatarTile uri={hostUriAt(0)} style={styles.miniImageHalf} />
        <View style={styles.separatorH} />
        <AvatarTile uri={hostUriAt(1)} style={styles.miniImageHalf} />
      </View>
    );
  }

  if (count === 3) {
    return (
      <View style={styles.splitCol}>
        <View style={styles.splitRow}>
          <AvatarTile uri={hostUriAt(0)} style={styles.miniImageQuarter} />
          <View style={styles.separatorV} />
          <AvatarTile uri={hostUriAt(1)} style={styles.miniImageQuarter} />
        </View>
        <View style={styles.separatorH} />
        <AvatarTile uri={hostUriAt(2)} style={styles.miniImageHalf} />
      </View>
    );
  }

  return (
    <View style={styles.splitCol}>
      <View style={styles.splitRow}>
        <AvatarTile uri={hostUriAt(0)} style={styles.miniImageQuarter} />
        <View style={styles.separatorV} />
        <AvatarTile uri={hostUriAt(1)} style={styles.miniImageQuarter} />
      </View>
      <View style={styles.separatorH} />
      <View style={styles.splitRow}>
        <AvatarTile uri={hostUriAt(2)} style={styles.miniImageQuarter} />
        <View style={styles.separatorV} />
        <AvatarTile uri={hostUriAt(3)} style={styles.miniImageQuarter}>
          {count > 4 && (
            <View style={styles.moreOverlay}>
              <AppText variant="smallBold" style={styles.moreTextMini}>
                +{count - 4}
              </AppText>
            </View>
          )}
        </AvatarTile>
      </View>
    </View>
  );
}

export const MiniHostsGrid = memo(MiniHostsGridComponent);

const styles = StyleSheet.create({
  miniImageFull: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  splitCol: {
    flex: 1,
    flexDirection: 'column',
  },
  splitRow: {
    flex: 1,
    flexDirection: 'row',
  },
  miniImageHalf: {
    flex: 1,
    width: '100%',
  },
  miniImageQuarter: {
    flex: 1,
    height: '100%',
  },
  placeholderTile: {
    backgroundColor: colors.surfaceAlt,
  },
  separatorH: {
    height: 1,
    backgroundColor: colors.textOnLight,
  },
  separatorV: {
    width: 1,
    backgroundColor: colors.textOnLight,
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayDarkStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreTextMini: {
    color: colors.textOnDark,
  },
});
