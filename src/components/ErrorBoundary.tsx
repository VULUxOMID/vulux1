import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    // In production, you might want to send this to an error reporting service
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <AppText style={styles.title}>Oops! Something went wrong</AppText>
            <AppText style={styles.message}>
              We encountered an unexpected error. Please try again.
            </AppText>
            {__DEV__ && this.state.error && (
              <AppText style={styles.errorDetail}>
                {this.state.error.toString()}
              </AppText>
            )}
            <Pressable style={styles.button} onPress={this.handleRetry}>
              <AppText style={styles.buttonText}>Try Again</AppText>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  errorDetail: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
