import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { AppScreen } from '../../components/AppScreen';
import { AppText } from '../../components/AppText';
import { colors, radius, spacing } from '../../theme';
import { useDemo } from './DemoContext';
import type { DemoInvite, DemoRoom } from './types';

function DemoCard({
  title,
  children,
  accentColor = colors.borderSubtle,
}: {
  title: string;
  children: ReactNode;
  accentColor?: string;
}) {
  return (
    <View style={[styles.card, { borderColor: accentColor }]}>
      <AppText variant="label" style={styles.cardTitle}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function RoomCard({
  room,
  actionLabel,
  onPress,
}: {
  room: DemoRoom;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.listCard}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <AppText variant="bodyBold">{room.title}</AppText>
          <AppText secondary>@{room.hostUsername}</AppText>
        </View>
        <View style={[styles.statusPill, room.status === 'live' ? styles.livePill : styles.readyPill]}>
          <AppText variant="tinyBold">{room.status === 'live' ? 'LIVE' : 'READY'}</AppText>
        </View>
      </View>
      <AppText secondary style={styles.metaText}>
        {room.viewerCount} viewer{room.viewerCount === 1 ? '' : 's'}
      </AppText>
      <AppButton title={actionLabel} onPress={onPress} style={styles.inlineButton} />
    </View>
  );
}

function InviteCard({
  invite,
  onAccept,
  onDecline,
}: {
  invite: DemoInvite;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.listCard}>
      <AppText variant="bodyBold">{invite.roomTitle}</AppText>
      <AppText secondary style={styles.metaText}>
        @{invite.hostUsername} invited you to join.
      </AppText>
      <View style={styles.buttonRow}>
        <AppButton title="Accept" onPress={onAccept} style={styles.flexButton} />
        <AppButton title="Decline" onPress={onDecline} variant="secondary" style={styles.flexButton} />
      </View>
    </View>
  );
}

function DemoLoginCard() {
  const { login, error } = useDemo();
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      await login(username);
    } catch (loginError) {
      setLocalError(loginError instanceof Error ? loginError.message : 'Failed to start demo session.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DemoCard title="Demo Login" accentColor={colors.accentPrimary}>
      <AppText secondary style={styles.sectionText}>
        Enter a username and that becomes the current demo user. No real auth is used here.
      </AppText>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="username"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={username}
        onChangeText={setUsername}
      />
      {localError || error ? (
        <AppText style={styles.errorText}>{localError || error}</AppText>
      ) : null}
      <AppButton
        title={submitting ? 'Logging in...' : 'Login'}
        onPress={handleLogin}
        disabled={submitting || username.trim().length === 0}
      />
    </DemoCard>
  );
}

export function DemoEntryScreen() {
  const router = useRouter();
  const {
    isReady,
    syncing,
    username,
    activeRooms,
    myRooms,
    pendingInvites,
    error,
    logout,
    refresh,
    joinRoom,
    respondToInvite,
  } = useDemo();
  const [actionError, setActionError] = useState<string | null>(null);

  const myOpenRoom = useMemo(
    () => myRooms.find((room) => room.status !== 'ended') ?? null,
    [myRooms],
  );

  if (!isReady) {
    return (
      <AppScreen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <AppText secondary style={styles.sectionText}>
            Loading demo session…
          </AppText>
        </View>
      </AppScreen>
    );
  }

  if (!username) {
    return (
      <AppScreen>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.hero}>
            <AppText variant="h1">Go Live Demo</AppText>
            <AppText secondary style={styles.sectionText}>
              This route isolates a stripped-down two-user live demo without Clerk, Apple login, or the full live stack.
            </AppText>
          </View>
          <DemoLoginCard />
        </ScrollView>
      </AppScreen>
    );
  }

  const handleOpenRoom = async (room: DemoRoom) => {
    setActionError(null);
    try {
      if (!room.isHost && !room.isViewer) {
        await joinRoom(room.id);
      }
      router.push(`/demo/room/${room.id}` as never);
    } catch (joinError) {
      setActionError(joinError instanceof Error ? joinError.message : 'Could not open that room.');
    }
  };

  const handleAcceptInvite = async (invite: DemoInvite) => {
    setActionError(null);
    try {
      const room = await respondToInvite(invite.id, true);
      router.push(`/demo/room/${room.id}` as never);
    } catch (inviteError) {
      setActionError(inviteError instanceof Error ? inviteError.message : 'Could not accept invite.');
    }
  };

  const handleDeclineInvite = async (invite: DemoInvite) => {
    setActionError(null);
    try {
      await respondToInvite(invite.id, false);
    } catch (inviteError) {
      setActionError(inviteError instanceof Error ? inviteError.message : 'Could not decline invite.');
    }
  };

  return (
    <AppScreen noPadding>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={() => void refresh()} tintColor={colors.accentPrimary} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <AppText variant="h1">Go Live Demo</AppText>
              <AppText secondary>Signed in as @{username}</AppText>
            </View>
            <Pressable onPress={() => void logout()} style={styles.linkButton}>
              <AppText variant="smallBold">Switch user</AppText>
            </Pressable>
          </View>
          <AppText secondary style={styles.sectionText}>
            Use two browsers or devices with different usernames to host, watch, and accept invites.
          </AppText>
          <AppButton title="Go Live" onPress={() => router.push('/demo/go-live' as never)} />
        </View>

        {error || actionError ? (
          <View style={styles.errorBanner}>
            <AppText>{actionError || error}</AppText>
          </View>
        ) : null}

        {pendingInvites.length > 0 ? (
          <DemoCard title="Pending Invites" accentColor={colors.accentWarning}>
            {pendingInvites.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                onAccept={() => void handleAcceptInvite(invite)}
                onDecline={() => void handleDeclineInvite(invite)}
              />
            ))}
          </DemoCard>
        ) : null}

        {myOpenRoom ? (
          <DemoCard title="Your Room" accentColor={colors.accentPrimary}>
            <RoomCard
              room={myOpenRoom}
              actionLabel={myOpenRoom.status === 'live' ? 'Open live' : 'Return to room'}
              onPress={() => void handleOpenRoom(myOpenRoom)}
            />
          </DemoCard>
        ) : null}

        <DemoCard title="Active Live Rooms">
          {activeRooms.length === 0 ? (
            <AppText secondary style={styles.sectionText}>
              No one is live right now. Start one from this demo account to test the flow.
            </AppText>
          ) : (
            activeRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                actionLabel={room.isHost ? 'Open live' : room.isViewer ? 'Rejoin' : 'Join as viewer'}
                onPress={() => void handleOpenRoom(room)}
              />
            ))
          )}
        </DemoCard>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sectionText: {
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.xs,
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
  errorBanner: {
    backgroundColor: colors.overlayAccentDangerSubtle,
    borderWidth: 1,
    borderColor: colors.accentDanger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  listCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
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
  metaText: {
    lineHeight: 20,
  },
  inlineButton: {
    alignSelf: 'flex-start',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flexButton: {
    flex: 1,
  },
  linkButton: {
    paddingVertical: spacing.xs,
  },
});
