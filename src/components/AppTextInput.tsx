import React, { forwardRef } from 'react';
import { TextInput, TextInputProps, StyleSheet, Platform } from 'react-native';
import { colors, typography, type TypographyVariant } from '../theme';

export interface AppTextInputProps extends TextInputProps {
    variant?: TypographyVariant;
}

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
    ({ style, variant = 'body', ...rest }, ref) => {
        return (
            <TextInput
                ref={ref}
                placeholderTextColor={colors.textMuted}
                style={[
                    styles.base,
                    typography[variant],
                    style,
                ]}
                {...rest}
            />
        );
    }
);

AppTextInput.displayName = 'AppTextInput';

const styles = StyleSheet.create({
    base: {
        color: colors.textPrimary,
        includeFontPadding: false,
        fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
        letterSpacing: 0,
    },
});
