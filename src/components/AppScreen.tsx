import { ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, spacing } from '../theme';

type AppScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
  edges?: Edge[];
};

const DEFAULT_EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

export function AppScreen({ children, style, noPadding, edges }: AppScreenProps) {
  return (
    <SafeAreaView
      style={[
        styles.container,
        style,
      ]}
      edges={edges ?? DEFAULT_EDGES}
    >
      <View style={[styles.content, !noPadding && styles.withPadding]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  withPadding: {
    padding: spacing.lg,
  },
});
