import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth as useSessionAuth } from '../auth/spacetimeSession';

import { type LiveItem } from '../features/home/LiveSection';
import {
  type LiveRoom,
  type LiveUser,
  type ChatMessage,
  type LiveState,
  type BoostMultiplier,
} from '../features/liveroom/types';
import { liveSessionUser, createChatMessage } from '../features/liveroom/liveSession';
import { createRoomFromLive } from '../features/liveroom/roomFactory';
import { requestBackendRefresh } from '../data/adapters/backend/refreshBus';
import { spendFuelTick } from '../data/adapters/backend/walletMutations';
import { useRepositories } from '../data/provider';
import { useWallet } from './WalletContext';
import { toast } from '../components/Toast';
import type { GlobalChatMessage, SocialUser } from '../data/contracts';
import { liveLifecycleClient, type LiveMutationResult } from '../lib/liveLifecycleClient';

type ExtendedLiveItem = LiveItem & {
  ownerUserId?: string;
  inviteOnly?: boolean;
  bannedUserIds?: string[];
  invitedUserIds?: string[];
};

type LiveContextType = {
  activeLive: LiveItem | null;
  isMinimized: boolean;
  switchLiveRoom: (live: LiveItem) => boolean;
  openLive: (live: LiveItem) => void;
  minimizeLive: () => void;
  leaveLive: () => void;
  endLive: () => void;
  closeLive: () => void;
  restoreLive: () => void;

  liveState: LiveState;
  isLiveEnding: boolean;
  liveEndDeadlineMs: number | null;
  liveRoom: LiveRoom | null;
  isHost: boolean;
  currentUser: LiveUser;

  enterLiveRoom: (room: LiveRoom, asHost?: boolean) => void;
  exitLiveRoom: () => void;

  sendMessage: (text: string) => void;
  addSystemMessage: (
    text: string,
    systemType?: ChatMessage['systemType'],
    extra?: Partial<ChatMessage>,
  ) => void;

  inviteToStream: (user: LiveUser) => void;
  kickStreamer: (user: LiveUser) => void;
  banUser: (user: LiveUser) => void;
  unbanUser: (user: LiveUser) => void;
  removeFromStream: (user: LiveUser) => void;

  setInviteOnly: (value: boolean) => void;
  setTitle: (title: string) => void;

  boostLive: (multiplier: BoostMultiplier) => void;
  resetBoost: () => void;

  startLive: (title: string, inviteOnly: boolean) => Promise<LiveMutationResult>;

  toggleMic: () => void;
};

const LiveContext = createContext<LiveContextType | undefined>(undefined);

function readPositiveMsEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const PRESENCE_HEARTBEAT_MS = readPositiveMsEnv(
  'EXPO_PUBLIC_LIVE_PRESENCE_HEARTBEAT_MS',
  10_000,
);

const LIVE_OVER_CONFIRMATION_MS = 1_500;
const LIVE_OVER_AUTO_CLOSE_MS = 5_000;
const LIVE_OVER_TITLE = 'Live is over';
const LIVE_STATUS_POLL_INTERVAL_MS = 2_000;
const FUEL_DRAIN_INTERVAL_MS = 1_000;
const LIVE_CHAT_MAX_MESSAGES = 200;

function normalizeUsername(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized && normalized.length > 0) {
    return normalized.slice(0, 40);
  }
  return fallback;
}

function isLikelyOpaqueUserId(value: string | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) return false;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }

  if (/^[0-9a-f]{32,64}$/i.test(normalized)) {
    return true;
  }

  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(normalized)) {
    return true;
  }

  if (/^user_[0-9A-Za-z]+$/.test(normalized)) {
    return true;
  }

  return false;
}

function shortUserId(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length <= 10) return normalized;
  return normalized.slice(0, 8);
}

function resolveFriendlyDisplayName(value: string | undefined, userId?: string): string {
  const normalizedValue = value?.trim();
  if (normalizedValue && !isLikelyOpaqueUserId(normalizedValue)) {
    return normalizedValue;
  }

  const shortId = shortUserId(userId);
  if (shortId) {
    return `User ${shortId}`;
  }

  return 'Unknown';
}

function resolveFriendlyUsername(
  value: string | undefined,
  displayName: string,
  userId?: string,
): string {
  const normalizedValue = value?.trim();
  if (normalizedValue && !isLikelyOpaqueUserId(normalizedValue)) {
    return normalizeUsername(normalizedValue, normalizeUsername(displayName, 'user'));
  }

  const shortId = shortUserId(userId);
  if (shortId) {
    return `user_${shortId.toLowerCase()}`;
  }

  return normalizeUsername(displayName, 'user');
}

function isGenericDisplayLabel(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'unknown' || normalized.startsWith('user ');
}

function shouldPreferMappedValue(currentValue: string | undefined, mappedValue: string | undefined): boolean {
  const normalizedMapped = mappedValue?.trim();
  if (!normalizedMapped || isLikelyOpaqueUserId(normalizedMapped)) {
    return false;
  }

  const normalizedCurrent = currentValue?.trim();
  if (!normalizedCurrent) {
    return true;
  }

  if (isLikelyOpaqueUserId(normalizedCurrent) || isGenericDisplayLabel(normalizedCurrent)) {
    return true;
  }

  return false;
}

function withFriendlyLiveUser(user: LiveUser): LiveUser {
  const name = resolveFriendlyDisplayName(user.name, user.id);
  const username = resolveFriendlyUsername(user.username, name, user.id);
  return {
    ...user,
    name,
    username,
  };
}

function mergeMappedUserIdentity(base: LiveUser, mapped?: LiveUser): LiveUser {
  if (!mapped) {
    return withFriendlyLiveUser(base);
  }

  const preferredName = shouldPreferMappedValue(base.name, mapped.name)
    ? mapped.name
    : base.name;
  const preferredUsername = shouldPreferMappedValue(base.username, mapped.username)
    ? mapped.username
    : base.username;

  return withFriendlyLiveUser({
    ...base,
    name: preferredName ?? base.name,
    username: preferredUsername ?? base.username,
    avatarUrl: base.avatarUrl || mapped.avatarUrl,
  });
}

function toLiveUserFromSocial(user: SocialUser): LiveUser {
  const friendlyName = resolveFriendlyDisplayName(user.username ?? undefined, user.id);
  return {
    id: user.id,
    name: friendlyName,
    username: resolveFriendlyUsername(user.username, friendlyName, user.id),
    age: 0,
    verified: false,
    country: '',
    bio: user.statusText || '',
    avatarUrl: user.avatarUrl || '',
  };
}

function toHostPayload(user: LiveUser) {
  const normalized = withFriendlyLiveUser(user);
  return {
    id: normalized.id,
    username: normalizeUsername(
      normalized.username || normalized.name,
      normalizeUsername(normalized.id, 'host'),
    ),
    name: normalized.name,
    age: normalized.age,
    country: normalized.country,
    bio: normalized.bio,
    verified: normalized.verified,
    avatar: normalized.avatarUrl,
  };
}

function toLiveUserFromHost(
  liveId: string,
  index: number,
  host: LiveItem['hosts'][number],
): LiveUser {
  const fallbackId = `host-${liveId}-${index}`;
  const resolvedId = typeof host.id === 'string' && host.id.trim().length > 0 ? host.id : fallbackId;
  const resolvedName = resolveFriendlyDisplayName(host.name?.trim() || host.username?.trim(), resolvedId);
  const resolvedUsername = resolveFriendlyUsername(host.username, resolvedName, resolvedId);

  return withFriendlyLiveUser({
    id: resolvedId,
    name: resolvedName,
    username: resolvedUsername,
    age: host.age,
    verified: host.verified,
    country: host.country,
    bio: host.bio,
    avatarUrl: host.avatar,
  });
}

function areLiveUsersEquivalent(a: LiveUser, b: LiveUser): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.username === b.username &&
    a.avatarUrl === b.avatarUrl &&
    a.isMuted === b.isMuted
  );
}

function areLiveUserListsEquivalent(a: LiveUser[], b: LiveUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!areLiveUsersEquivalent(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

type LiveAccessRejectionReason = 'invite_only' | 'banned' | 'live_ended';

function readLiveAccessErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return '';
    }
  }
  return '';
}

function resolveLiveAccessRejectionReasonFromError(error: unknown): LiveAccessRejectionReason | null {
  const message = readLiveAccessErrorMessage(error).toLowerCase();
  if (!message) return null;

  if (message.includes('invite only')) return 'invite_only';
  if (
    message.includes("you're banned") ||
    message.includes('you are banned') ||
    message.includes('banned from live')
  ) {
    return 'banned';
  }
  if (message.includes('live has ended') || message.includes('already ended') || message.includes('not found')) {
    return 'live_ended';
  }

  return null;
}

function resolveLiveAccessRejectionReasonFromMutation(
  result: LiveMutationResult,
): LiveAccessRejectionReason | null {
  if (result.ok) return null;
  if (result.code === 'invite_only') return 'invite_only';
  if (result.code === 'banned') return 'banned';
  if (result.code === 'live_ended' || result.code === 'not_found') return 'live_ended';
  return null;
}

function messageForLiveAccessRejectionReason(reason: LiveAccessRejectionReason): string {
  if (reason === 'invite_only') return 'Invite only';
  if (reason === 'banned') return "You're banned";
  return 'Live has ended';
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function makeLiveMutationFailure(
  code: Extract<LiveMutationResult, { ok: false }>['code'],
  message: string,
): LiveMutationResult {
  return {
    ok: false,
    code,
    message,
  };
}

function normalizeLiveUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const normalized = entry.trim();
    if (!normalized) return;
    seen.add(normalized);
  });
  return Array.from(seen);
}

function areLiveUserIdListsEquivalent(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aSet = new Set(a);
  if (aSet.size !== b.length) return false;
  for (const userId of b) {
    if (!aSet.has(userId)) {
      return false;
    }
  }
  return true;
}

function areChatMessagesEquivalent(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].type !== b[i].type ||
      a[i].text !== b[i].text ||
      a[i].timestamp !== b[i].timestamp ||
      a[i].user?.id !== b[i].user?.id ||
      a[i].systemType !== b[i].systemType
    ) {
      return false;
    }
  }
  return true;
}

function compareChatMessages(a: ChatMessage, b: ChatMessage): number {
  const byTimestamp = a.timestamp - b.timestamp;
  if (byTimestamp !== 0) {
    return byTimestamp;
  }
  return a.id.localeCompare(b.id);
}

function appendBoundedChatMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const nextMessages = [...messages, message].sort(compareChatMessages);
  if (nextMessages.length <= LIVE_CHAT_MAX_MESSAGES) {
    return nextMessages;
  }
  return nextMessages.slice(nextMessages.length - LIVE_CHAT_MAX_MESSAGES);
}

function mergeLiveChatMessages(
  localMessages: ChatMessage[],
  backendMessages: ChatMessage[],
): ChatMessage[] {
  const backendMessageIds = new Set(backendMessages.map((message) => message.id));
  const mergedMessages = new Map<string, ChatMessage>();

  localMessages.forEach((message) => {
    if (message.type !== 'system' && backendMessageIds.has(message.id)) {
      return;
    }
    mergedMessages.set(message.id, message);
  });

  backendMessages.forEach((message) => {
    mergedMessages.set(message.id, message);
  });

  const orderedMessages = Array.from(mergedMessages.values()).sort(compareChatMessages);
  if (orderedMessages.length <= LIVE_CHAT_MAX_MESSAGES) {
    return orderedMessages;
  }
  return orderedMessages.slice(orderedMessages.length - LIVE_CHAT_MAX_MESSAGES);
}

function toLiveChatMessage(
  message: GlobalChatMessage,
  resolveUser: (senderId?: string, senderName?: string) => LiveUser | undefined,
): ChatMessage {
  const timestamp =
    typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)
      ? message.createdAt
      : Date.now();
  const senderId = typeof message.senderId === 'string' ? message.senderId : undefined;
  const senderName = typeof message.user === 'string' ? message.user : undefined;
  const resolvedType = message.type === 'system' ? 'system' : 'user';

  return {
    id: message.id,
    type: resolvedType,
    user: resolvedType === 'user' ? resolveUser(senderId, senderName) : undefined,
    text: message.text || '',
    timestamp,
  };
}

const defaultLiveValue: LiveContextType = {
  activeLive: null,
  isMinimized: false,
  switchLiveRoom: () => false,
  openLive: () => { },
  minimizeLive: () => { },
  leaveLive: () => { },
  endLive: () => { },
  closeLive: () => { },
  restoreLive: () => { },

  liveState: 'LIVE_CLOSED',
  isLiveEnding: false,
  liveEndDeadlineMs: null,
  liveRoom: null,
  isHost: false,
  currentUser: liveSessionUser,

  enterLiveRoom: () => { },
  exitLiveRoom: () => { },

  sendMessage: () => { },
  addSystemMessage: () => { },

  inviteToStream: () => { },
  kickStreamer: () => { },
  banUser: () => { },
  unbanUser: () => { },
  removeFromStream: () => { },

  setInviteOnly: () => { },
  setTitle: () => { },
  boostLive: () => { },
  resetBoost: () => { },
  startLive: async () => ({
    ok: false,
    code: 'reducers_unavailable',
    message: 'Live context is unavailable.',
  }),
  toggleMic: () => { },
};

export function LiveProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded: isAuthLoaded } = useSessionAuth();
  const { live: liveRepo, social: socialRepo, messages: messagesRepo } = useRepositories();
  const { fuel, walletStateAvailable } = useWallet();
  const fuelRef = useRef(fuel);
  useEffect(() => { fuelRef.current = fuel; }, [fuel]);

  const [activeLive, setActiveLive] = useState<LiveItem | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [liveEndingState, setLiveEndingState] = useState<{
    liveId: string;
    deadlineMs: number;
  } | null>(null);

  const [liveState, setLiveState] = useState<LiveState>('LIVE_CLOSED');
  const [liveRoom, setLiveRoom] = useState<LiveRoom | null>(null);
  const [isHost, setIsHost] = useState(false);

  const activeLiveRef = useRef<LiveItem | null>(null);
  const liveRoomRef = useRef<LiveRoom | null>(null);
  const liveRoomMessageScopeRef = useRef<string | null>(null);
  const liveStartInFlightRef = useRef(false);
  const liveEndDetectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveEndAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLiveEndTimers = useCallback(() => {
    if (liveEndDetectionTimerRef.current) {
      clearTimeout(liveEndDetectionTimerRef.current);
      liveEndDetectionTimerRef.current = null;
    }
    if (liveEndAutoCloseTimerRef.current) {
      clearTimeout(liveEndAutoCloseTimerRef.current);
      liveEndAutoCloseTimerRef.current = null;
    }
  }, []);

  const [userMediaState, setUserMediaState] = useState({ isMuted: false });

  const queriesEnabled = isAuthLoaded && Boolean(userId);

  const socialUsers = useMemo(
    () => (queriesEnabled ? socialRepo.listUsers({ limit: 1500 }) : []),
    [queriesEnabled, socialRepo],
  );

  const knownLiveUsers = useMemo(
    () => (queriesEnabled ? liveRepo.listKnownLiveUsers({ limit: 800 }) : []),
    [liveRepo, queriesEnabled],
  );

  const currentSocialUser = useMemo(
    () => (userId ? socialUsers.find((item) => item.id === userId) : undefined),
    [socialUsers, userId],
  );

  const baseCurrentUser = useMemo<LiveUser>(() => {
    if (!userId) {
      return liveSessionUser;
    }

    const knownUser = knownLiveUsers.find((item) => item.id === userId);
    if (knownUser) {
      return {
        ...knownUser,
        id: userId,
      };
    }

    if (currentSocialUser) {
      return toLiveUserFromSocial(currentSocialUser);
    }

    return {
      id: userId,
      name: 'You',
      username: normalizeUsername(userId, 'you'),
      age: 0,
      verified: false,
      country: '',
      bio: '',
      avatarUrl: '',
    };
  }, [currentSocialUser, knownLiveUsers, userId]);

  const currentUserWithMedia = useMemo(
    () => ({
      ...baseCurrentUser,
      ...userMediaState,
    }),
    [baseCurrentUser, userMediaState],
  );

  const knownUsersById = useMemo(() => {
    const byId = new Map<string, LiveUser>();

    knownLiveUsers.forEach((user) => {
      byId.set(user.id, withFriendlyLiveUser({
        ...user,
        username: resolveFriendlyUsername(user.username, user.name, user.id),
      }));
    });

    socialUsers.forEach((socialUser) => {
      const fromSocial = withFriendlyLiveUser(toLiveUserFromSocial(socialUser));
      const existing = byId.get(socialUser.id);
      if (!existing) {
        byId.set(socialUser.id, fromSocial);
        return;
      }

      byId.set(
        socialUser.id,
        mergeMappedUserIdentity(
          {
            ...existing,
            avatarUrl: existing.avatarUrl || fromSocial.avatarUrl,
          },
          fromSocial,
        ),
      );
    });

    byId.set(currentUserWithMedia.id, withFriendlyLiveUser(currentUserWithMedia));
    return byId;
  }, [currentUserWithMedia, knownLiveUsers, socialUsers]);

  const resolveLiveUser = useCallback(
    (targetUserId?: string, fallbackName?: string): LiveUser | undefined => {
      if (!targetUserId || targetUserId.trim().length === 0) {
        return undefined;
      }

      if (targetUserId === currentUserWithMedia.id) {
        return withFriendlyLiveUser(currentUserWithMedia);
      }

      const known = knownUsersById.get(targetUserId);
      if (known) {
        return withFriendlyLiveUser(known);
      }

      const resolvedName = resolveFriendlyDisplayName(fallbackName?.trim(), targetUserId);
      return withFriendlyLiveUser({
        id: targetUserId,
        name: resolvedName,
        username: resolveFriendlyUsername(undefined, resolvedName, targetUserId),
        age: 0,
        verified: false,
        country: '',
        bio: '',
        avatarUrl: '',
      });
    },
    [currentUserWithMedia, knownUsersById],
  );

  const selectedLiveId = liveRoom?.id ?? activeLive?.id;

  useEffect(() => {
    activeLiveRef.current = activeLive;
  }, [activeLive]);

  useEffect(() => {
    liveRoomRef.current = liveRoom;
  }, [liveRoom]);

  useEffect(() => {
    return () => {
      clearLiveEndTimers();
    };
  }, [clearLiveEndTimers]);

  const snapshotLive = useMemo<ExtendedLiveItem | undefined>(() => {
    if (!queriesEnabled || !selectedLiveId) return undefined;
    return liveRepo.findLiveById(selectedLiveId) as ExtendedLiveItem | undefined;
  }, [liveRepo, queriesEnabled, selectedLiveId]);

  const snapshotPresence = useMemo(
    () =>
      queriesEnabled && selectedLiveId
        ? liveRepo.listPresence({ liveId: selectedLiveId, limit: 700 })
        : [],
    [liveRepo, queriesEnabled, selectedLiveId],
  );

  const snapshotRoomMessages = useMemo(
    () =>
      queriesEnabled && selectedLiveId
        ? messagesRepo.listGlobalMessages({ roomId: selectedLiveId, limit: LIVE_CHAT_MAX_MESSAGES })
        : [],
    [messagesRepo, queriesEnabled, selectedLiveId],
  );

  const forceCloseLiveForAccessRejection = useCallback((reason: LiveAccessRejectionReason) => {
    clearLiveEndTimers();
    setLiveEndingState(null);
    setActiveLive(null);
    setIsMinimized(false);
    setLiveState('LIVE_CLOSED');
    setLiveRoom(null);
    setIsHost(false);
    requestBackendRefresh({
      scopes: ['live', 'global_messages'],
      source: 'manual',
      reason:
        reason === 'banned'
          ? 'live_banned_user_forced_exit'
          : reason === 'invite_only'
            ? 'live_invite_only_forced_exit'
            : 'live_ended_forced_exit',
    });
  }, [clearLiveEndTimers]);

  const handleLiveAccessRejection = useCallback(
    (reason: LiveAccessRejectionReason) => {
      toast.warning(messageForLiveAccessRejectionReason(reason));
      forceCloseLiveForAccessRejection(reason);
    },
    [forceCloseLiveForAccessRejection],
  );

  const postLiveMutation = useCallback(
    async (path: string, payload: Record<string, unknown>): Promise<LiveMutationResult> => {
      if (!isAuthLoaded || !userId) {
        return makeLiveMutationFailure('unauthenticated', 'Sign in to manage live sessions.');
      }

      const liveId = asTrimmedString(payload.liveId);
      if (path === '/live/start') {
        if (!liveId) {
          return makeLiveMutationFailure('invalid_input', 'Live id is required to start a live.');
        }
        return liveLifecycleClient.startLive({
          liveId,
          ownerUserId: userId,
          title: asTrimmedString(payload.title) ?? 'Live',
          inviteOnly: payload.inviteOnly === true,
          viewers: Math.max(0, Math.floor(asFiniteNumber(payload.viewers) ?? 1)),
          hosts: Array.isArray(payload.hosts) ? payload.hosts : [],
          bannedUserIds: Array.isArray(payload.bannedUserIds)
            ? normalizeLiveUserIds(payload.bannedUserIds)
            : [],
        });
      }

      if (path === '/live/update') {
        if (!liveId) {
          return makeLiveMutationFailure('invalid_input', 'Live id is required to update a live.');
        }

        const parsedViewers = asFiniteNumber(payload.viewers);
        return liveLifecycleClient.updateLive({
          liveId,
          title: asTrimmedString(payload.title) ?? undefined,
          inviteOnly: typeof payload.inviteOnly === 'boolean' ? payload.inviteOnly : undefined,
          viewers:
            parsedViewers === null
              ? undefined
              : Math.max(0, Math.floor(parsedViewers)),
          hosts: Array.isArray(payload.hosts) ? payload.hosts : undefined,
          bannedUserIds: Array.isArray(payload.bannedUserIds)
            ? normalizeLiveUserIds(payload.bannedUserIds)
            : undefined,
        });
      }

      if (path === '/live/presence') {
        const normalizedActivity = asTrimmedString(payload.activity);
        const activity: 'hosting' | 'watching' | 'none' =
          normalizedActivity === 'hosting' || normalizedActivity === 'watching'
            ? normalizedActivity
            : 'none';

        return liveLifecycleClient.setLivePresence({
          userId,
          activity,
          liveId: liveId ?? undefined,
          liveTitle: asTrimmedString(payload.liveTitle) ?? undefined,
        });
      }

      if (path === '/live/ban') {
        const targetUserId = asTrimmedString(payload.targetUserId);
        if (!liveId || !targetUserId) {
          return makeLiveMutationFailure(
            'invalid_input',
            'Live id and target user id are required to ban a user.',
          );
        }
        return liveLifecycleClient.banLiveUser({
          liveId,
          targetUserId,
          actorUserId: userId,
        });
      }

      if (path === '/live/unban') {
        const targetUserId = asTrimmedString(payload.targetUserId);
        if (!liveId || !targetUserId) {
          return makeLiveMutationFailure(
            'invalid_input',
            'Live id and target user id are required to unban a user.',
          );
        }
        return liveLifecycleClient.unbanLiveUser({
          liveId,
          targetUserId,
          actorUserId: userId,
        });
      }

      if (path === '/live/end') {
        if (!liveId) {
          return makeLiveMutationFailure('invalid_input', 'Live id is required to end a live.');
        }
        return liveLifecycleClient.endLive({
          liveId,
          actorUserId: userId,
        });
      }

      if (path === '/live/boost') {
        if (!liveId) {
          return makeLiveMutationFailure('invalid_input', 'Live id is required to boost a live.');
        }
        return liveLifecycleClient.boostLive({
          liveId,
          actorUserId: userId,
          amount: Math.max(1, Math.floor(asFiniteNumber(payload.amount) ?? 1)),
        });
      }

      if (path === '/live/event/tick') {
        if (!liveId) {
          return makeLiveMutationFailure(
            'invalid_input',
            'Live id is required to tick live event state.',
          );
        }
        return liveLifecycleClient.tickLiveEvent({ liveId });
      }

      return makeLiveMutationFailure('invalid_input', `Unsupported live mutation path: ${path}`);
    },
    [isAuthLoaded, userId],
  );

  const syncLivePresence = useCallback(
    (
      activity: 'hosting' | 'watching' | 'none',
      liveId?: string,
      liveTitle?: string,
    ): Promise<LiveMutationResult> => {
      const normalizedLiveTitle =
        typeof liveTitle === 'string' && liveTitle.trim().length > 0
          ? liveTitle.trim().slice(0, 80)
          : undefined;
      return postLiveMutation('/live/presence', {
        activity,
        liveId,
        liveTitle: activity === 'hosting' ? normalizedLiveTitle : undefined,
      }).then((result) => {
        if (activity !== 'none') {
          const rejectionReason = resolveLiveAccessRejectionReasonFromMutation(result);
          if (rejectionReason) {
            handleLiveAccessRejection(rejectionReason);
          }
        }
        return result;
      });
    },
    [handleLiveAccessRejection, postLiveMutation],
  );

  const syncLiveHosts = useCallback(
    (room: LiveRoom) => {
      void postLiveMutation('/live/update', {
        liveId: room.id,
        title: room.title,
        inviteOnly: room.inviteOnly,
        viewers: Math.max(0, room.watchers.length + room.streamers.length),
        hosts: room.streamers.map((streamer) => toHostPayload(streamer)),
        bannedUserIds: room.bannedUserIds,
      }).finally(() => {
        requestBackendRefresh({
          scopes: ['live'],
          source: 'manual',
          reason: 'live_hosts_updated',
        });
      });
    },
    [postLiveMutation],
  );

  useEffect(() => {
    if (!liveRoom) {
      liveRoomMessageScopeRef.current = null;
      return;
    }
    const roomId = liveRoom.id;
    const didSwitchLiveRoom = liveRoomMessageScopeRef.current !== roomId;
    if (didSwitchLiveRoom) {
      liveRoomMessageScopeRef.current = roomId;
    }
    const isCurrentLiveEnding = liveEndingState?.liveId === roomId;
    const hasSnapshotWithoutHosts =
      Boolean(snapshotLive) &&
      Array.isArray(snapshotLive?.hosts) &&
      snapshotLive.hosts.length === 0;
    const shouldShowLiveOverState = isCurrentLiveEnding || hasSnapshotWithoutHosts;

    const nextStreamersBase =
      shouldShowLiveOverState
        ? []
        : snapshotLive?.hosts && snapshotLive.hosts.length > 0
          ? snapshotLive.hosts.map((host, index) => toLiveUserFromHost(roomId, index, host))
          : liveRoom.streamers;

    const nextStreamers = nextStreamersBase.map((streamer) => {
      const mappedUser = resolveLiveUser(streamer.id, streamer.name);
      const mergedUser = mergeMappedUserIdentity(streamer, mappedUser);
      if (mergedUser.id === currentUserWithMedia.id) {
        return withFriendlyLiveUser({
          ...mergedUser,
          ...currentUserWithMedia,
        });
      }
      return mergedUser;
    });

    const snapshotBannedUserIds =
      snapshotLive && Array.isArray(snapshotLive.bannedUserIds)
        ? normalizeLiveUserIds(snapshotLive.bannedUserIds)
        : undefined;

    const hostUserIds = new Set(nextStreamers.map((streamer) => streamer.id));
    const bannedUserIdSet = new Set(snapshotBannedUserIds ?? liveRoom.bannedUserIds ?? []);

    const watchersById = new Map<string, LiveUser>();
    snapshotPresence.forEach((presenceEntry) => {
      if (presenceEntry.activity !== 'watching') return;
      if (presenceEntry.liveId !== roomId) return;
      if (hostUserIds.has(presenceEntry.userId)) return;
      if (bannedUserIdSet.has(presenceEntry.userId)) return;

      const resolvedUser = resolveLiveUser(presenceEntry.userId);
      if (!resolvedUser) return;
      watchersById.set(resolvedUser.id, resolvedUser);
    });

    const nextWatchers = shouldShowLiveOverState ? [] : Array.from(watchersById.values());

    const normalizedRoomId = roomId.trim().toLowerCase();
    const backendMessages = snapshotRoomMessages
      .filter((message) => {
        const messageRoomId = typeof message.roomId === 'string' ? message.roomId.trim().toLowerCase() : '';
        return messageRoomId === normalizedRoomId;
      })
      .map((message) =>
        toLiveChatMessage(message, (senderId, senderName) =>
          resolveLiveUser(senderId, senderName),
        ),
      )
      .sort(compareChatMessages);

    setLiveRoom((prev) => {
      if (!prev || prev.id !== roomId) return prev;

      const nextChatMessages = didSwitchLiveRoom
        ? mergeLiveChatMessages([], backendMessages)
        : mergeLiveChatMessages(prev.chatMessages, backendMessages);

      const nextTitle = shouldShowLiveOverState
        ? LIVE_OVER_TITLE
        : typeof snapshotLive?.title === 'string'
          ? snapshotLive.title
          : prev.title;
      const nextInviteOnly =
        typeof snapshotLive?.inviteOnly === 'boolean' ? snapshotLive.inviteOnly : prev.inviteOnly;
      const nextHostUser = shouldShowLiveOverState ? prev.hostUser : nextStreamers[0] ?? prev.hostUser;
      const nextBannedUserIds = snapshotBannedUserIds ?? normalizeLiveUserIds(prev.bannedUserIds);
      const previousBannedUsersById = new Map((prev.bannedUsers || []).map((user) => [user.id, user]));
      const nextBannedUsers = nextBannedUserIds
        .map((bannedUserId) => previousBannedUsersById.get(bannedUserId) ?? resolveLiveUser(bannedUserId))
        .filter((entry): entry is LiveUser => Boolean(entry));

      const hasChanges =
        prev.title !== nextTitle ||
        prev.inviteOnly !== nextInviteOnly ||
        !areLiveUsersEquivalent(prev.hostUser, nextHostUser) ||
        !areLiveUserListsEquivalent(prev.streamers, nextStreamers) ||
        !areLiveUserListsEquivalent(prev.watchers, nextWatchers) ||
        !areLiveUserIdListsEquivalent(prev.bannedUserIds || [], nextBannedUserIds) ||
        !areChatMessagesEquivalent(prev.chatMessages, nextChatMessages);

      if (!hasChanges) {
        return prev;
      }

      return {
        ...prev,
        title: nextTitle,
        inviteOnly: nextInviteOnly,
        hostUser: nextHostUser,
        streamers: nextStreamers,
        watchers: nextWatchers,
        bannedUserIds: nextBannedUserIds,
        bannedUsers: nextBannedUsers,
        chatMessages: nextChatMessages,
      };
    });

    setActiveLive((prev) => {
      if (!prev || prev.id !== roomId) return prev;

      const nextTitle = shouldShowLiveOverState
        ? LIVE_OVER_TITLE
        : typeof snapshotLive?.title === 'string'
          ? snapshotLive.title
          : prev.title;
      const nextHosts = shouldShowLiveOverState
        ? []
        : nextStreamers.map((streamer) => ({
          id: streamer.id,
          username: streamer.username,
          name: streamer.name,
          age: streamer.age,
          country: streamer.country,
          bio: streamer.bio,
          verified: streamer.verified,
          avatar: streamer.avatarUrl,
        }));
      const nextViewers = shouldShowLiveOverState ? 0 : nextWatchers.length + nextStreamers.length;
      const nextImages = shouldShowLiveOverState
        ? []
        : nextStreamers.map((streamer) => streamer.avatarUrl).filter(Boolean);

      const hasChanges =
        prev.title !== nextTitle ||
        prev.viewers !== nextViewers ||
        prev.hosts.length !== nextHosts.length ||
        prev.images.length !== nextImages.length;

      if (!hasChanges) {
        return prev;
      }

      return {
        ...prev,
        title: nextTitle,
        viewers: nextViewers,
        hosts: nextHosts,
        images: nextImages,
      };
    });
  }, [
    currentUserWithMedia,
    liveRoom,
    resolveLiveUser,
    snapshotLive,
    snapshotPresence,
    snapshotRoomMessages,
    liveEndingState?.liveId,
  ]);

  useEffect(() => {
    if (!userId || !liveRoom) return;
    const snapshotOwnerId = snapshotLive?.ownerUserId;
    const hostUserIdSet = new Set(
      (snapshotLive?.hosts || [])
        .map((host) => (typeof host.id === 'string' && host.id.trim().length > 0 ? host.id : null))
        .filter((value): value is string => Boolean(value)),
    );
    const shouldBeHost =
      isHost || snapshotOwnerId === userId || hostUserIdSet.has(userId) || liveRoom.hostUser.id === userId;
    if (shouldBeHost !== isHost) {
      setIsHost(shouldBeHost);
    }
  }, [isHost, liveRoom, snapshotLive, userId]);

  useEffect(() => {
    const currentLiveId = liveRoom?.id ?? activeLive?.id;
    const hasSnapshotLive = Boolean(snapshotLive);
    const hasSnapshotHosts = Array.isArray(snapshotLive?.hosts) && snapshotLive.hosts.length > 0;
    const shouldCheckLiveOver = !hasSnapshotLive || !hasSnapshotHosts;
    const isAlreadyEnding = Boolean(currentLiveId && liveEndingState?.liveId === currentLiveId);

    if (!queriesEnabled || !currentLiveId || liveState === 'LIVE_CLOSED' || isHost || !shouldCheckLiveOver) {
      if (liveEndDetectionTimerRef.current) {
        clearTimeout(liveEndDetectionTimerRef.current);
        liveEndDetectionTimerRef.current = null;
      }
      if (!shouldCheckLiveOver && isAlreadyEnding) {
        clearLiveEndTimers();
        setLiveEndingState(null);
      }
      return;
    }

    if (isAlreadyEnding) return;

    if (liveEndDetectionTimerRef.current) {
      clearTimeout(liveEndDetectionTimerRef.current);
      liveEndDetectionTimerRef.current = null;
    }

    liveEndDetectionTimerRef.current = setTimeout(() => {
      const latestLiveId = liveRoomRef.current?.id ?? activeLiveRef.current?.id;
      if (!latestLiveId || latestLiveId !== currentLiveId) return;

      setIsHost(false);
      setLiveEndingState({
        liveId: currentLiveId,
        deadlineMs: Date.now() + LIVE_OVER_AUTO_CLOSE_MS,
      });
    }, LIVE_OVER_CONFIRMATION_MS);

    return () => {
      if (liveEndDetectionTimerRef.current) {
        clearTimeout(liveEndDetectionTimerRef.current);
        liveEndDetectionTimerRef.current = null;
      }
    };
  }, [
    activeLive?.id,
    clearLiveEndTimers,
    isHost,
    liveEndingState?.liveId,
    liveRoom?.id,
    liveState,
    queriesEnabled,
    snapshotLive,
  ]);

  useEffect(() => {
    if (!isAuthLoaded || !userId) return;
    if (liveState === 'LIVE_CLOSED') return;

    const currentLiveId = liveRoom?.id ?? activeLive?.id;
    if (!currentLiveId) return;
    const currentLiveTitle = liveRoom?.title ?? activeLive?.title;

    const currentActivity: 'hosting' | 'watching' = isHost ? 'hosting' : 'watching';
    void syncLivePresence(currentActivity, currentLiveId, currentLiveTitle);
    const heartbeat = setInterval(() => {
      void syncLivePresence(currentActivity, currentLiveId, currentLiveTitle);
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
    };
  }, [
    activeLive?.id,
    activeLive?.title,
    isAuthLoaded,
    isHost,
    liveRoom?.id,
    liveRoom?.title,
    liveState,
    syncLivePresence,
    userId,
  ]);

  useEffect(() => {
    if (!queriesEnabled) return;
    if (liveState === 'LIVE_CLOSED') return;

    const refreshLiveSnapshot = () => {
      requestBackendRefresh({
        scopes: ['live'],
        source: 'manual',
        reason: 'live_status_poll',
      });
    };

    refreshLiveSnapshot();
    const pollInterval = setInterval(refreshLiveSnapshot, LIVE_STATUS_POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollInterval);
    };
  }, [liveState, queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled) return;
    if (liveState === 'LIVE_CLOSED') return;
    if (!isHost) return;

    const currentLiveId = liveRoom?.id ?? activeLive?.id;
    if (!currentLiveId) return;

    const tickLiveEvent = () => {
      void postLiveMutation('/live/event/tick', { liveId: currentLiveId });
    };

    tickLiveEvent();
    const interval = setInterval(tickLiveEvent, 60_000);
    return () => {
      clearInterval(interval);
    };
  }, [activeLive?.id, isHost, liveRoom?.id, liveState, postLiveMutation, queriesEnabled]);

  const finalizeLiveClose = useCallback((refreshReason: string) => {
    clearLiveEndTimers();
    setLiveEndingState(null);
    setActiveLive(null);
    setIsMinimized(false);
    setLiveState('LIVE_CLOSED');
    setLiveRoom(null);
    setIsHost(false);

    void syncLivePresence('none');
    requestBackendRefresh({
      scopes: ['live', 'global_messages'],
      source: 'manual',
      reason: refreshReason,
    });
  }, [clearLiveEndTimers, syncLivePresence]);

  const leaveLive = useCallback(() => {
    finalizeLiveClose('live_left');
  }, [finalizeLiveClose]);

  const endLive = useCallback(() => {
    const closingLiveId = liveRoom?.id ?? activeLive?.id;
    if (!closingLiveId) {
      finalizeLiveClose('live_ended_by_host');
      return;
    }

    void postLiveMutation('/live/end', { liveId: closingLiveId }).then((result) => {
      if (!result.ok && result.code !== 'not_found') {
        toast.error(result.message);
        return;
      }
      finalizeLiveClose('live_ended_by_host');
    });
  }, [activeLive?.id, finalizeLiveClose, liveRoom?.id, postLiveMutation]);

  const closeLive = useCallback(() => {
    if (isHost) {
      endLive();
      return;
    }
    leaveLive();
  }, [endLive, isHost, leaveLive]);

  const closeLiveRef = useRef(closeLive);
  useEffect(() => { closeLiveRef.current = closeLive; }, [closeLive]);
  const fuelDrainInFlightRef = useRef(false);

  useEffect(() => {
    if (liveState === 'LIVE_CLOSED') return;

    if (walletStateAvailable && fuelRef.current <= 0) {
      toast.warning('You are out of fuel. Your live session has ended.');
      closeLiveRef.current();
      return;
    }

    const drainInterval = setInterval(() => {
      if (!userId || fuelDrainInFlightRef.current) {
        return;
      }

      fuelDrainInFlightRef.current = true;
      void spendFuelTick(userId, 1, 'live_tick')
        .then((result) => {
          if (!result.ok && result.code === 'insufficient_fuel') {
            closeLiveRef.current();
          }
        })
        .finally(() => {
          fuelDrainInFlightRef.current = false;
        });
    }, FUEL_DRAIN_INTERVAL_MS);

    return () => {
      clearInterval(drainInterval);
      fuelDrainInFlightRef.current = false;
    };
  }, [liveState, userId, walletStateAvailable]);

  const switchLiveRoom = useCallback(
    (live: LiveItem): boolean => {
      const asExtendedLive = live as ExtendedLiveItem;
      const authoritativeLive =
        queriesEnabled && live.id
          ? (liveRepo.findLiveById(live.id) as ExtendedLiveItem | undefined)
          : undefined;
      const effectiveLive = authoritativeLive ?? asExtendedLive;
      const normalizedBannedUserIds = normalizeLiveUserIds(effectiveLive.bannedUserIds);
      if (userId && normalizedBannedUserIds.includes(userId)) {
        toast.warning("You've been banned from this live.");
        requestBackendRefresh({
          scopes: ['live'],
          source: 'manual',
          reason: 'live_open_blocked_banned_user',
        });
        return false;
      }
      const hostUserIds = new Set(
        (effectiveLive.hosts || [])
          .map((host) => (typeof host.id === 'string' && host.id.trim().length > 0 ? host.id : null))
          .filter((value): value is string => Boolean(value)),
      );
      const nextIsHost = Boolean(
        userId && (effectiveLive.ownerUserId === userId || hostUserIds.has(userId)),
      );

      if (nextIsHost && walletStateAvailable && fuel <= 0) {
        toast.warning('You are out of fuel. Refuel before joining a live as a host.');
        return false;
      }

      const resolvedHosts = (live.hosts || []).map((host) => {
        const normalizedHostId =
          typeof host.id === 'string' && host.id.trim().length > 0 ? host.id.trim() : undefined;
        const mappedUser = normalizedHostId
          ? resolveLiveUser(normalizedHostId, host.name || host.username)
          : undefined;
        const resolvedName = mappedUser?.name ?? resolveFriendlyDisplayName(host.name || host.username, normalizedHostId);
        const resolvedUsername =
          mappedUser?.username ??
          resolveFriendlyUsername(host.username, resolvedName, normalizedHostId);

        return {
          ...host,
          id: normalizedHostId ?? host.id,
          name: resolvedName,
          username: resolvedUsername,
          avatar: host.avatar || mappedUser?.avatarUrl || '',
        };
      });

      const liveWithResolvedHosts: LiveItem = {
        ...live,
        hosts: resolvedHosts,
      };

      const nextRoom = {
        ...createRoomFromLive(liveWithResolvedHosts, {
          inviteOnly: effectiveLive.inviteOnly === true,
          initialBoostRank: null,
          initialBoosts: 0,
          hostUserOverride: nextIsHost ? currentUserWithMedia : undefined,
        }),
        bannedUserIds: normalizedBannedUserIds,
        bannedUsers: [],
      };

      clearLiveEndTimers();
      setLiveEndingState(null);
      setActiveLive(liveWithResolvedHosts);
      setIsMinimized(false);
      setLiveState('LIVE_FULL');
      setLiveRoom(nextRoom);
      setIsHost(nextIsHost);
      void syncLivePresence(nextIsHost ? 'hosting' : 'watching', live.id, live.title);
      requestBackendRefresh({
        scopes: ['live', 'global_messages'],
        source: 'manual',
        reason: 'live_room_opened',
      });
      return true;
    },
    [
      clearLiveEndTimers,
      currentUserWithMedia,
      fuel,
      liveRepo,
      queriesEnabled,
      resolveLiveUser,
      syncLivePresence,
      userId,
      walletStateAvailable,
    ],
  );

  const openLive = useCallback(
    (live: LiveItem) => {
      switchLiveRoom(live);
    },
    [switchLiveRoom],
  );

  const minimizeLive = useCallback(() => {
    if (activeLive) {
      setIsMinimized(true);
      setLiveState('LIVE_MINIMIZED');
    }
  }, [activeLive]);

  useEffect(() => {
    if (!liveEndingState) return;

    const delayMs = Math.max(0, liveEndingState.deadlineMs - Date.now());
    if (liveEndAutoCloseTimerRef.current) {
      clearTimeout(liveEndAutoCloseTimerRef.current);
    }

    liveEndAutoCloseTimerRef.current = setTimeout(() => {
      const currentLiveId = liveRoomRef.current?.id ?? activeLiveRef.current?.id;
      if (currentLiveId !== liveEndingState.liveId) {
        setLiveEndingState((current) =>
          current?.liveId === liveEndingState.liveId ? null : current,
        );
        return;
      }
      closeLive();
    }, delayMs);

    return () => {
      if (liveEndAutoCloseTimerRef.current) {
        clearTimeout(liveEndAutoCloseTimerRef.current);
        liveEndAutoCloseTimerRef.current = null;
      }
    };
  }, [closeLive, liveEndingState]);

  useEffect(() => {
    if (!userId || !liveRoom) return;
    const bannedUserIds = normalizeLiveUserIds(snapshotLive?.bannedUserIds);
    if (!bannedUserIds.includes(userId)) return;
    closeLive();
  }, [closeLive, liveRoom, snapshotLive?.bannedUserIds, userId]);

  useEffect(() => {
    if (!userId || !liveRoom) return;
    const selfPresence = snapshotPresence.find(
      (entry) => entry.userId === userId && entry.liveId === liveRoom.id,
    );
    if (!selfPresence || selfPresence.activity !== 'blocked') return;
    handleLiveAccessRejection('banned');
  }, [handleLiveAccessRejection, liveRoom, snapshotPresence, userId]);

  const restoreLive = useCallback(() => {
    if (activeLive) {
      setIsMinimized(false);
      if (isHost && walletStateAvailable && fuel <= 0) {
        toast.warning('You are out of fuel. Refuel before joining a live.');
        return;
      }

      setLiveState('LIVE_FULL');
    }
  }, [activeLive, isHost, fuel, walletStateAvailable]);

  const enterLiveRoom = useCallback(
    (room: LiveRoom, asHost = false) => {
      if (asHost && walletStateAvailable && fuel <= 0) {
        toast.warning('You are out of fuel. Refuel before joining a live.');
        return;
      }

      clearLiveEndTimers();
      setLiveEndingState(null);
      setLiveRoom(room);
      setIsHost(asHost);
      setLiveState('LIVE_FULL');

      const nextActiveLive: ExtendedLiveItem = {
        id: room.id,
        title: room.title,
        viewers: room.watchers.length + room.streamers.length,
        inviteOnly: room.inviteOnly,
        ownerUserId: asHost ? currentUserWithMedia.id : undefined,
        images: room.streamers.map((streamer) => streamer.avatarUrl),
        hosts: room.streamers.map((streamer) => ({
          id: streamer.id,
          username: streamer.username,
          name: streamer.name,
          age: streamer.age,
          country: streamer.country,
          bio: streamer.bio,
          verified: streamer.verified,
          avatar: streamer.avatarUrl,
        })),
      };
      setActiveLive(nextActiveLive);

      setIsMinimized(false);
      void syncLivePresence(asHost ? 'hosting' : 'watching', room.id, room.title);

      if (asHost) {
        void postLiveMutation('/live/start', {
          liveId: room.id,
          title: room.title,
          inviteOnly: room.inviteOnly,
          viewers: Math.max(0, room.watchers.length + room.streamers.length),
          hosts: room.streamers.map((streamer) => toHostPayload(streamer)),
        })
          .then((result) => {
            if (!result.ok) {
              toast.error(result.message);
            }
          })
          .finally(() => {
            requestBackendRefresh({
              scopes: ['live'],
              source: 'manual',
              reason: 'live_started',
            });
          });
      }
    },
    [clearLiveEndTimers, currentUserWithMedia.id, fuel, postLiveMutation, syncLivePresence, walletStateAvailable],
  );

  const exitLiveRoom = useCallback(() => {
    closeLive();
  }, [closeLive]);

  const sendMessage = useCallback(
    (text: string) => {
      const normalizedText = text.trim();
      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      if (!normalizedText || !currentLiveId) return;

      const message = createChatMessage(normalizedText, currentUserWithMedia);
      setLiveRoom((prev) => {
        if (!prev || prev.id !== currentLiveId) return prev;
        if (prev.chatMessages.some((entry) => entry.id === message.id)) {
          return prev;
        }
        return {
          ...prev,
          chatMessages: appendBoundedChatMessage(prev.chatMessages, message),
        };
      });

      void messagesRepo
        .sendGlobalMessage({
          clientMessageId: message.id,
          roomId: currentLiveId,
          message: {
            id: message.id,
            user: currentUserWithMedia.name,
            senderId: currentUserWithMedia.id,
            text: normalizedText,
            type: 'user',
            createdAt: message.timestamp,
            roomId: currentLiveId,
          },
        })
        .then(() => {
          requestBackendRefresh({
            scopes: ['global_messages'],
            source: 'manual',
            reason: 'live_message_sent',
          });
        })
        .catch((error) => {
          const rejectionReason = resolveLiveAccessRejectionReasonFromError(error);
          if (rejectionReason) {
            handleLiveAccessRejection(rejectionReason);
            return;
          }
          if (__DEV__) {
            console.warn('[live] Failed to send live chat message', error);
          }
        });
    },
    [activeLive?.id, currentUserWithMedia, handleLiveAccessRejection, liveRoom?.id, messagesRepo],
  );

  const addSystemMessage = useCallback(
    (
      text: string,
      systemType?: ChatMessage['systemType'],
      extra?: Partial<ChatMessage>,
    ) => {
      const message = createChatMessage(text, undefined, 'system', systemType, extra);
      setLiveRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chatMessages: appendBoundedChatMessage(prev.chatMessages, message),
        };
      });
    },
    [],
  );

  const inviteToStream = useCallback(
    (user: LiveUser) => {
      if (!isHost) return;

      let nextRoomSnapshot: LiveRoom | null = null;

      setLiveRoom((prev) => {
        if (!prev) return prev;
        if (prev.streamers.some((streamer) => streamer.id === user.id)) {
          return prev;
        }

        const newWatchers = prev.watchers.filter((watcher) => watcher.id !== user.id);
        const newStreamers = [...prev.streamers, user];

        nextRoomSnapshot = {
          ...prev,
          watchers: newWatchers,
          streamers: newStreamers,
          hostUser: newStreamers[0] ?? prev.hostUser,
          chatMessages: appendBoundedChatMessage(
            prev.chatMessages,
            createChatMessage(`${user.name} joined as a co-host.`, undefined, 'system', 'join'),
          ),
        };
        return nextRoomSnapshot;
      });

      setActiveLive((prev) => {
        if (!prev) return prev;
        if (prev.hosts.some((host) => host.id === user.id)) {
          return prev;
        }
        return {
          ...prev,
          hosts: [
            ...prev.hosts,
            {
              id: user.id,
              username: user.username,
              name: user.name,
              age: user.age,
              country: user.country,
              bio: user.bio,
              verified: user.verified,
              avatar: user.avatarUrl,
            },
          ],
        };
      });

      if (nextRoomSnapshot) {
        syncLiveHosts(nextRoomSnapshot);
      }
    },
    [isHost, syncLiveHosts],
  );

  const kickStreamer = useCallback(
    (user: LiveUser) => {
      if (!isHost) return;

      let nextRoomSnapshot: LiveRoom | null = null;

      setLiveRoom((prev) => {
        if (!prev) return prev;
        if (user.id === prev.hostUser.id) return prev;

        const newStreamers = prev.streamers.filter((streamer) => streamer.id !== user.id);
        const alreadyWatching = prev.watchers.some((watcher) => watcher.id === user.id);
        const newWatchers = alreadyWatching ? prev.watchers : [...prev.watchers, user];

        nextRoomSnapshot = {
          ...prev,
          streamers: newStreamers,
          watchers: newWatchers,
          hostUser: newStreamers[0] ?? prev.hostUser,
          chatMessages: appendBoundedChatMessage(
            prev.chatMessages,
            createChatMessage(
              `${user.name} was removed from streaming.`,
              undefined,
              'system',
              'kick',
            ),
          ),
        };

        return nextRoomSnapshot;
      });

      setActiveLive((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          hosts: prev.hosts.filter((host) => host.id !== user.id),
        };
      });

      if (nextRoomSnapshot) {
        syncLiveHosts(nextRoomSnapshot);
      }
    },
    [isHost, syncLiveHosts],
  );

  const banUser = useCallback(
    (user: LiveUser) => {
      if (!isHost) return;
      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      if (!currentLiveId) return;
      if (user.id === liveRoom?.hostUser.id) return;

      void postLiveMutation('/live/ban', {
        liveId: currentLiveId,
        targetUserId: user.id,
      })
        .then((result) => {
          if (!result.ok) {
            toast.error(result.message);
          }
        })
        .finally(() => {
          requestBackendRefresh({
            scopes: ['live'],
            source: 'manual',
            reason: 'live_user_banned',
          });
        });
    },
    [activeLive?.id, isHost, liveRoom?.hostUser.id, liveRoom?.id, postLiveMutation],
  );

  const unbanUser = useCallback(
    (user: LiveUser) => {
      if (!isHost) return;
      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      if (!currentLiveId) return;

      void postLiveMutation('/live/unban', {
        liveId: currentLiveId,
        targetUserId: user.id,
      })
        .then((result) => {
          if (!result.ok) {
            toast.error(result.message);
          }
        })
        .finally(() => {
          requestBackendRefresh({
            scopes: ['live'],
            source: 'manual',
            reason: 'live_user_unbanned',
          });
        });
    },
    [activeLive?.id, isHost, liveRoom?.id, postLiveMutation],
  );

  const removeFromStream = useCallback(
    (user: LiveUser) => {
      let nextRoomSnapshot: LiveRoom | null = null;

      setLiveRoom((prev) => {
        if (!prev) return prev;

        const newStreamers = prev.streamers.filter((streamer) => streamer.id !== user.id);
        const alreadyWatching = prev.watchers.some((watcher) => watcher.id === user.id);
        const newWatchers = alreadyWatching ? prev.watchers : [...prev.watchers, user];

        nextRoomSnapshot = {
          ...prev,
          streamers: newStreamers,
          watchers: newWatchers,
          hostUser: newStreamers[0] ?? prev.hostUser,
          chatMessages: appendBoundedChatMessage(
            prev.chatMessages,
            createChatMessage(`${user.name} left the stream.`, undefined, 'system', 'leave'),
          ),
        };

        return nextRoomSnapshot;
      });

      setActiveLive((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          hosts: prev.hosts.filter((host) => host.id !== user.id),
        };
      });

      if (nextRoomSnapshot) {
        syncLiveHosts(nextRoomSnapshot);
      }
    },
    [syncLiveHosts],
  );

  const setInviteOnly = useCallback(
    (value: boolean) => {
      if (!isHost) return;

      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      setLiveRoom((prev) => (prev ? { ...prev, inviteOnly: value } : null));
      if (currentLiveId) {
        void postLiveMutation('/live/update', {
          liveId: currentLiveId,
          inviteOnly: value,
        }).finally(() => {
          requestBackendRefresh({
            scopes: ['live'],
            source: 'manual',
            reason: 'live_updated',
          });
        });
      }
    },
    [activeLive?.id, isHost, liveRoom?.id, postLiveMutation],
  );

  const setTitle = useCallback(
    (title: string) => {
      if (!isHost) return;

      const normalizedTitle = title.trim().slice(0, 80);
      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      setLiveRoom((prev) => (prev ? { ...prev, title: normalizedTitle } : null));
      setActiveLive((prev) => (prev ? { ...prev, title: normalizedTitle } : null));
      if (currentLiveId) {
        void syncLivePresence('hosting', currentLiveId, normalizedTitle);
        void postLiveMutation('/live/update', {
          liveId: currentLiveId,
          title: normalizedTitle,
        }).finally(() => {
          requestBackendRefresh({
            scopes: ['live'],
            source: 'manual',
            reason: 'live_updated',
          });
        });
      }
    },
    [activeLive?.id, isHost, liveRoom?.id, postLiveMutation, syncLivePresence],
  );

  const boostLive = useCallback(
    (multiplier: BoostMultiplier) => {
      setLiveRoom((prev) => {
        if (!prev) return prev;

        const newBoosts = prev.totalBoosts + multiplier;
        const newRank = Math.max(1, (prev.boostRank || 10) - Math.floor(multiplier / 5));

        return {
          ...prev,
          totalBoosts: newBoosts,
          boostRank: newRank,
          chatMessages: appendBoundedChatMessage(
            prev.chatMessages,
            createChatMessage(
              `You just boosted the live. ${multiplier}x ⚡`,
              undefined,
              'system',
              'boost',
              { boostAmount: multiplier },
            ),
          ),
        };
      });

      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      if (currentLiveId) {
        void postLiveMutation('/live/boost', {
          liveId: currentLiveId,
          amount: multiplier,
        }).finally(() => {
          requestBackendRefresh({
            scopes: ['live'],
            source: 'manual',
            reason: 'live_boosted',
          });
        });
      }
    },
    [activeLive?.id, liveRoom?.id, postLiveMutation],
  );

  const resetBoost = useCallback(() => {
    setLiveRoom((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        totalBoosts: 0,
        boostRank: null,
        chatMessages: appendBoundedChatMessage(
          prev.chatMessages,
          createChatMessage(`⏰ Boost expired! Your live dropped from the rankings.`, undefined, 'system'),
        ),
      };
    });
  }, []);

  const startLive = useCallback(
    async (title: string, inviteOnly: boolean): Promise<LiveMutationResult> => {
      if (!isAuthLoaded || !userId) {
        return makeLiveMutationFailure('unauthenticated', 'Sign in before starting a live.');
      }

      if (liveStartInFlightRef.current) {
        return makeLiveMutationFailure(
          'invalid_input',
          'A live start is already in progress. Please wait a moment.',
        );
      }

      if (activeLiveRef.current || liveRoomRef.current || liveState !== 'LIVE_CLOSED') {
        return makeLiveMutationFailure(
          'invalid_input',
          'Leave your current live before starting a new one.',
        );
      }

      if (walletStateAvailable && fuel <= 0) {
        toast.warning('You are out of fuel. Refuel before starting a live.');
        return makeLiveMutationFailure('invalid_input', 'You are out of fuel.');
      }

      const normalizedTitle = title.trim().slice(0, 80);
      if (normalizedTitle.length < 3) {
        toast.warning('Add a live title (at least 3 characters).');
        return makeLiveMutationFailure('invalid_input', 'Live title must be at least 3 characters.');
      }

      liveStartInFlightRef.current = true;
      try {
        const liveId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const hostUser = withFriendlyLiveUser(currentUserWithMedia);
        const hosts = [toHostPayload(hostUser)];

        const startResult = await postLiveMutation('/live/start', {
          liveId,
          title: normalizedTitle,
          inviteOnly,
          viewers: 1,
          hosts,
        });

        if (!startResult.ok) {
          return startResult;
        }

        const newRoom: LiveRoom = {
          id: liveId,
          title: normalizedTitle,
          inviteOnly,
          hostUser,
          streamers: [hostUser],
          watchers: [],
          chatMessages: [
            createChatMessage(`${hostUser.name} started the live!`, undefined, 'system', 'join'),
          ],
          boostRank: null,
          totalBoosts: 0,
          bannedUserIds: [],
          bannedUsers: [],
          createdAt: Date.now(),
        };

        clearLiveEndTimers();
        setLiveEndingState(null);
        setLiveRoom(newRoom);
        setIsHost(true);
        setLiveState('LIVE_FULL');

        const nextActiveLive: ExtendedLiveItem = {
          id: newRoom.id,
          title: newRoom.title,
          viewers: 1,
          ownerUserId: hostUser.id,
          inviteOnly,
          images: [hostUser.avatarUrl],
          hosts: [
            {
              id: hostUser.id,
              username: hostUser.username,
              name: hostUser.name,
              age: hostUser.age,
              country: hostUser.country,
              bio: hostUser.bio,
              verified: hostUser.verified,
              avatar: hostUser.avatarUrl,
            },
          ],
        };
        setActiveLive(nextActiveLive);

        setIsMinimized(false);
        const presenceResult = await syncLivePresence('hosting', newRoom.id, newRoom.title);
        if (
          !presenceResult.ok &&
          presenceResult.code !== 'live_ended' &&
          presenceResult.code !== 'not_found'
        ) {
          toast.warning('Live started, but presence sync failed. Reconnecting...');
        }

        requestBackendRefresh({
          scopes: ['live'],
          source: 'manual',
          reason: 'live_started',
        });

        return { ok: true };
      } finally {
        liveStartInFlightRef.current = false;
      }
    },
    [
      clearLiveEndTimers,
      currentUserWithMedia,
      fuel,
      isAuthLoaded,
      liveState,
      postLiveMutation,
      syncLivePresence,
      userId,
      walletStateAvailable,
    ],
  );

  const toggleMic = useCallback(() => {
    setUserMediaState((prev) => ({
      ...prev,
      isMuted: !prev.isMuted,
    }));
  }, []);

  const isLiveEnding = Boolean(liveRoom && liveEndingState?.liveId === liveRoom.id);
  const liveEndDeadlineMs = isLiveEnding ? liveEndingState?.deadlineMs ?? null : null;

  return (
    <LiveContext.Provider
      value={{
        activeLive,
        isMinimized,
        switchLiveRoom,
        openLive,
        minimizeLive,
        leaveLive,
        endLive,
        closeLive,
        restoreLive,

        liveState,
        isLiveEnding,
        liveEndDeadlineMs,
        liveRoom,
        isHost,
        currentUser: currentUserWithMedia,

        enterLiveRoom,
        exitLiveRoom,
        sendMessage,
        addSystemMessage,
        inviteToStream,
        kickStreamer,
        banUser,
        unbanUser,
        removeFromStream,
        setInviteOnly,
        setTitle,
        boostLive,
        resetBoost,
        startLive,

        toggleMic,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  const context = useContext(LiveContext);
  if (!context) {
    if (__DEV__) {
      console.warn('useLive must be used within a LiveProvider. Using default values.');
    }
    return defaultLiveValue;
  }
  return context;
}
