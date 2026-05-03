import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../theme';
import { TopBar } from '../TopBar';
import { HomeSearchBar } from './HomeSearchBar';

type HomeStickyHeaderProps = {
  topInset?: number;
  searchAnim: Animated.Value;
  searchText: string;
  onChangeSearchText: (text: string) => void;
};

export const HomeStickyHeader = React.memo(function HomeStickyHeader({
  topInset = 0,
  searchAnim,
  searchText,
  onChangeSearchText,
}: HomeStickyHeaderProps) {
  return (
    <View style={[styles.stickyHeader, { paddingTop: spacing.sm + topInset }]}
    >
      <TopBar />
      <Animated.View
        style={[
          styles.searchBarContainer,
          {
            height: searchAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 50],
              extrapolate: 'clamp',
            }),
            opacity: searchAnim,
          },
        ]}
      >
        <HomeSearchBar value={searchText} onChangeText={onChangeSearchText} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  stickyHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  searchBarContainer: {
    overflow: 'hidden',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
});
