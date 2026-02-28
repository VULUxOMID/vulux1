import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminTextInput } from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';

export type AdminFilterOption = {
  label: string;
  value: string;
};

export function AdminChoiceFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AdminFilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <Pressable
              key={`${label}-${option.value || 'all'}`}
              onPress={() => onChange(option.value)}
              style={[styles.chip, isActive ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AdminRangeFilter({
  label,
  minValue,
  maxValue,
  onChangeMin,
  onChangeMax,
  helperText,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onChangeMin: (value: string) => void;
  onChangeMax: (value: string) => void;
  helperText?: string;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rangeRow}>
        <View style={styles.rangeField}>
          <AdminTextInput
            value={minValue}
            onChangeText={onChangeMin}
            placeholder="Min"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.rangeField}>
          <AdminTextInput
            value={maxValue}
            onChangeText={onChangeMax}
            placeholder="Max"
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: adminTokens.spacing.gapSm,
  },
  label: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: 8,
    borderRadius: adminTokens.radius.chip,
    backgroundColor: adminTokens.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: adminTokens.colors.border,
  },
  chipActive: {
    backgroundColor: adminTokens.colors.primarySubtle,
    borderColor: adminTokens.colors.primaryBorder,
  },
  chipText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: adminTokens.colors.primary,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: adminTokens.spacing.gapSm,
  },
  rangeField: {
    flex: 1,
  },
  helperText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textMuted,
  },
});
