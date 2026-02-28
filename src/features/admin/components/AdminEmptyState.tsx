import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { adminTokens } from '../ui/adminTokens';

type EmptyStateAction = {
  label: string;
  onPress: () => void;
};

export function AdminEmptyState({
  icon = 'folder-open-outline',
  title,
  description,
  actions = [],
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
}) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={30} color={adminTokens.colors.textSecondary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actions.length ? (
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <Pressable key={action.label} onPress={action.onPress} style={styles.actionButton}>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.card,
    backgroundColor: adminTokens.colors.surface,
    paddingVertical: adminTokens.spacing.section,
    paddingHorizontal: adminTokens.spacing.card,
    gap: adminTokens.spacing.gapSm,
  },
  title: {
    ...adminTokens.typography.cardTitle,
    color: adminTokens.colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...adminTokens.typography.sectionDescription,
    color: adminTokens.colors.textSecondary,
    textAlign: 'center',
  },
  actionsRow: {
    marginTop: adminTokens.spacing.gapSm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: adminTokens.spacing.gapSm,
  },
  actionButton: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.primaryBorder,
    borderRadius: adminTokens.radius.button,
    backgroundColor: adminTokens.colors.primarySubtle,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
  },
  actionLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.primary,
  },
});
