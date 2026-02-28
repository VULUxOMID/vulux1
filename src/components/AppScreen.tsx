import { ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

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
        !noPadding && styles.withPadding,
        style,
      ]}
      edges={edges ?? DEFAULT_EDGES}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  withPadding: {
    padding: spacing.lg,
  },
});

