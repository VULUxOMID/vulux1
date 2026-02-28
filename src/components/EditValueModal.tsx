import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, TextInput, View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type EditValueModalProps = {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
  multiline?: boolean;
  validate?: (value: string) => string | null;
};

export function EditValueModal({
  visible,
  title,
  initialValue,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  onClose,
  onSave,
  multiline = false,
  validate,
}: EditValueModalProps) {
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setIsSaving(false);
    }
  }, [visible, initialValue]);

  const validationError = validate ? validate(value) : null;
  const canSave = !isSaving && !validationError;

  const handleSave = async () => {
    if (isSaving) {
      return;
    }
    if (validationError) {
      return;
    }

    setIsSaving(true);
    try {
      await Promise.resolve(onSave(value));
      onClose();
    } catch {
      // Keep modal open so user can retry when save fails.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.container}>
          <View style={styles.header}>
            <AppText variant="h3" style={styles.title}>{title}</AppText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <TextInput
              style={[styles.input, multiline && styles.multilineInput]}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              keyboardType={keyboardType}
              secureTextEntry={secureTextEntry}
              autoCapitalize={autoCapitalize}
              autoCorrect={autoCorrect}
              autoFocus
              multiline={multiline}
              textAlignVertical={multiline ? 'top' : 'center'}
              selectionColor={colors.accentPrimary}
            />
            {validationError ? (
              <AppText variant="small" style={styles.errorText}>
                {validationError}
              </AppText>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <AppText style={styles.cancelText}>Cancel</AppText>
            </Pressable>
            <Pressable
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <AppText style={styles.saveText}>Save</AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  multilineInput: {
    height: 120,
    paddingTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.accentDanger,
  },
});
