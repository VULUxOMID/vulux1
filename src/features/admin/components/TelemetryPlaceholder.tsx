import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { adminTokens } from '../ui/adminTokens';

export function TelemetryPlaceholder({ detail }: { detail?: string }) {
  return (
    <View style={styles.container}>
      <Ionicons name="pulse-outline" size={18} color={adminTokens.colors.textMuted} />
      <View style={styles.copy}>
        <Text style={styles.title}>No telemetry connected</Text>
        <Text style={styles.detail}>
          {detail?.trim() || 'Connect the live admin runtime to populate operational metrics.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: adminTokens.spacing.gapSm,
    padding: adminTokens.spacing.gapSm,
    borderRadius: adminTokens.radius.input,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
  detail: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
});
