import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';


type LiveInputBarProps = {
  onSend: (text: string) => void;
  onRaiseHandRequest?: () => void;
  isHost?: boolean;
  bottomInset?: number;
};

export function LiveInputBar({ onSend, onRaiseHandRequest, isHost, bottomInset = 0 }: LiveInputBarProps) {
  const [text, setText] = useState('');

  const handleSend = (textToSend: string = text) => {
    const trimmedText = textToSend.trim();
    if (!trimmedText) return;
    hapticTap();
    onSend(trimmedText);
    setText('');
  };

  const handleRaiseHand = () => {
    hapticTap();
    if (onRaiseHandRequest) {
      onRaiseHandRequest();
      return;
    }
    handleSend('👋');
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(8, bottomInset),
        },
      ]}
    >
      {/* Input Row */}
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Aa"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            blurOnSubmit={false}
          />
        </View>
        
        {/* Hand wave button - only for viewers to request to join */}
        {!isHost && (
          <Pressable 
            style={styles.handWaveButton}
            onPress={handleRaiseHand}
            testID="live-raise-hand-button"
          >
            <Ionicons name="hand-right" size={24} color="#fff" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    height: '100%',
    paddingVertical: 0,
  },
  handWaveButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
