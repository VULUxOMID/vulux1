import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { AppScreen } from '../../components/AppScreen';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing } from '../../theme';
import { useDemo } from './DemoContext';
import type { DemoRoom } from './types';

const POLL_INTERVAL_MS = 3_000;

function statusLabel(room: DemoRoom): string {
  if (room.status === 'live') return 'Live now';
  if (room.status === 'ended') return 'Ended';
  return 'Ready room';
}

export function DemoRoomScreen() {
  const params = useLocalSearchParams<{ roomId?: string | string[] }>();
  const router = useRouter();
  const { username, getRoom, startRoom, inviteUser, leaveRoom } = useDemo();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const [room, setRoom] = useState<DemoRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [busyAction, setBusyAction] = useState<'start' | 'invite' | 'leave' | null>(null);

  const loadRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const nextRoom = await getRoom(roomId);
      setRoom(nextRoom);
      setError(null);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : 'Could not load this demo room.');
    } finally {
      setLoading(false);
    }
  }, [getRoom, roomId]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (!roomId) return;
    const intervalId = setInterval(() => {
      void loadRoom();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loadRoom, roomId]);

  if (!username) {
    return <Redirect href={'/demo' as never} />;
  }

  if (!roomId) {
    return <Redirect href={'/demo' as never} />;
  }

  const handleStartLive = async () => {
    setBusyAction('start');
    setError(null);
    try {
      const nextRoom = await startRoom(roomId);
      setRoom(nextRoom);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start this live.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleInvite = async () => {
    setBusyAction('invite');
    setError(null);
    try {
      await inviteUser(roomId, inviteUsername);
      setInviteUsername('');
      await loadRoom();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not send invite.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLeave = async () => {
    setBusyAction('leave');
    setError(null);
    try {
      await leaveRoom(roomId);
      router.replace('/demo' as never);
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : 'Could not leave this room.');
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !room) {
    return (
      <AppScreen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <AppText secondary>Loading room…</AppText>
        </View>
      </AppScreen>
    );
  }

  if (!room) {
    return (
      <AppScreen>
        <View style={styles.centered}>
          <AppText variant="h2">Room unavailable</AppText>
          <AppText secondary>{error || 'This room could not be loaded.'}</AppText>
          <AppButton title="Back to demo home" onPress={() => router.replace('/demo' as never)} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen noPadding>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View style={styles.statusRow}>
            <View style={styles.flex}>
              <AppText variant="h1">{room.title}</AppText>
              <AppText secondary>
                Host: @{room.hostUsername} {room.isHost ? '(you)' : ''}
              </AppText>
            </View>
            <View style={[styles.statusPill, room.status === 'live' ? styles.livePill : styles.readyPill]}>
              <AppText variant="tinyBold">{statusLabel(room)}</AppText>
            </View>
          </View>

          {room.status === 'created' ? (
            <AppText secondary>
              {room.isHost
                ? 'Room is created. Press Go Live when you are ready to start the demo.'
                : 'You are in the room. Waiting for the host to press Go Live.'}
            </AppText>
          ) : room.status === 'live' ? (
            <AppText secondary>
              {room.isHost
                ? 'Your demo live is running. Invite another username or keep this screen open while viewers join.'
                : 'You joined as a viewer. Keep this room open while the host is live.'}
            </AppText>
          ) : (
            <AppText secondary>This room has ended.</AppText>
          )}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <AppText>{error}</AppText>
          </View>
        ) : null}

        {room.isHost && room.status !== 'ended' ? (
          <View style={styles.card}>
            <AppText variant="label">Host controls</AppText>
            {room.status !== 'live' ? (
              <AppButton
                title={busyAction === 'start' ? 'Starting...' : 'Go Live'}
                onPress={handleStartLive}
                disabled={busyAction !== null}
              />
            ) : (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <AppText>Live is active</AppText>
              </View>
            )}

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="viewer username"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={inviteUsername}
              onChangeText={setInviteUsername}
            />
            <AppButton
              title={busyAction === 'invite' ? 'Inviting...' : 'Invite viewer'}
              onPress={handleInvite}
              disabled={busyAction !== null || inviteUsername.trim().length === 0}
              variant="secondary"
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <AppText variant="label">People in room</AppText>
          <View style={styles.personRow}>
            <AppText variant="bodyBold">@{room.hostUsername}</AppText>
            <AppText secondary>Host</AppText>
          </View>
          {room.viewerUsernames.length === 0 ? (
            <AppText secondary>No viewers joined yet.</AppText>
          ) : (
            room.viewerUsernames.map((viewerUsername) => (
              <View key={viewerUsername} style={styles.personRow}>
                <AppText>@{viewerUsername}</AppText>
                <AppText secondary>{viewerUsername === username ? 'You' : 'Viewer'}</AppText>
              </View>
            ))
          )}
        </View>

        {room.invitedUsernames.length > 0 ? (
          <View style={styles.card}>
            <AppText variant="label">Invited users</AppText>
            {room.invitedUsernames.map((invitedUsername) => (
              <AppText key={invitedUsername} secondary>
                @{invitedUsername}
              </AppText>
            ))}
          </View>
        ) : null}

        <AppButton
          title={room.isHost ? 'End room' : 'Leave room'}
          onPress={handleLeave}
          variant={room.isHost ? 'danger' : 'secondary'}
          disabled={busyAction !== null}
        />
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.xl,
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  livePill: {
    backgroundColor: colors.accentDanger,
  },
  readyPill: {
    backgroundColor: colors.accentPrimary,
  },
  errorBanner: {
    backgroundColor: colors.overlayAccentDangerSubtle,
    borderWidth: 1,
    borderColor: colors.accentDanger,
    borderRadius: radius.md,
    padding: spacing.md,
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
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.accentDanger,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
});
