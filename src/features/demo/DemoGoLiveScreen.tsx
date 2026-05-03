import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { AppScreen } from '../../components/AppScreen';
import { AppText } from '../../components/AppText';
import { DemoApiError } from './demoApi';
import { useDemo } from './DemoContext';
import { colors, radius, spacing } from '../../theme';

export function DemoGoLiveScreen() {
  const router = useRouter();
  const { username, createRoom } = useDemo();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!username) {
    return <Redirect href={'/demo' as never} />;
  }

  const handleCreateRoom = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const room = await createRoom(title);
      router.replace(`/demo/room/${room.id}` as never);
    } catch (createError) {
      if (createError instanceof DemoApiError && createError.statusCode === 409) {
        const existingRoomId = createError.details?.roomId;
        if (typeof existingRoomId === 'string' && existingRoomId.length > 0) {
          router.replace(`/demo/room/${existingRoomId}` as never);
          return;
        }
      }

      setError(createError instanceof Error ? createError.message : 'Could not create demo room.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <AppText variant="h1">Create Demo Live</AppText>
          <AppText secondary>
            Signed in as @{username}. Pick a live title, then enter the room. You will start the live from inside the room.
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText variant="label">Live title</AppText>
          <TextInput
            maxLength={80}
            placeholder="Friday countdown"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={title}
            onChangeText={setTitle}
          />
          {error ? <AppText style={styles.errorText}>{error}</AppText> : null}
          <AppButton
            title={submitting ? 'Creating...' : 'Enter room'}
            onPress={handleCreateRoom}
            disabled={submitting || title.trim().length === 0}
          />
          <AppButton title="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  errorText: {
    color: colors.accentDanger,
  },
});
