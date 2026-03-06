import type {
  Conversation,
  GlobalChatMessage,
  MessagesRepository,
  ThreadSeedMessage,
} from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';
import type { BackendHttpClient } from './httpClient';
import { requestBackendRefresh } from './refreshBus';
import {
  isSpacetimeViewActive,
  isSpacetimeViewRequested,
  spacetimeDb,
} from '../../../lib/spacetime';

type UnknownRecord = Record<string, unknown>;

type ThreadMessageEvent = {
  conversationKey: string;
  fromUserId: string;
  toUserId: string;
  message: ThreadSeedMessage;
};

type ConversationReadEvent = {
  conversationKey: string;
  readerUserId: string;
  otherUserId: string;
  readAt: number;
};

type UserDirectoryEntry = {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  updatedAt: number;
};

const globalMessagesCacheByRoom = new Map<string, GlobalChatMessage[]>();
const conversationsCacheByViewer = new Map<string, Conversation[]>();
const threadMessagesCacheByConversation = new Map<string, ThreadSeedMessage[]>();

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  return null;
}

function readSpacetimeTimestampMs(value: unknown): number {
  const directNumber = toFiniteNumber(value);
  if (directNumber !== null) {
    return directNumber;
  }

  if (value && typeof value === 'object') {
    const maybeToMillis = (value as { toMillis?: () => unknown }).toMillis;
    if (typeof maybeToMillis === 'function') {
      const millis = toFiniteNumber(maybeToMillis.call(value));
      if (millis !== null) {
        return millis;
      }
    }

    const micros =
      (value as { microsSinceUnixEpoch?: unknown }).microsSinceUnixEpoch ??
      (value as { __timestamp_micros_since_unix_epoch__?: unknown })
        .__timestamp_micros_since_unix_epoch__;
    const microsAsNumber = toFiniteNumber(micros);
    if (microsAsNumber !== null) {
      return Math.floor(microsAsNumber / 1000);
    }
  }

  return Date.now();
}

function parseJsonRecord(itemRaw: unknown): UnknownRecord {
  if (typeof itemRaw !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(itemRaw);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : {};
  } catch {
    return {};
  }
}

function parseJsonArray(itemRaw: unknown): unknown[] {
  if (typeof itemRaw !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(itemRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readTimestampOrIsoMs(value: unknown): number | null {
  const directNumber = toFiniteNumber(value);
  if (directNumber !== null) {
    return directNumber;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function buildConversationKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('::');
}

function isIdentityLikeName(userId: string, value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  if (userId && normalized === userId.toLowerCase()) return true;
  if (normalized === 'user' || normalized === 'unknown-user') return true;
  if (/^user_[a-z0-9]{10,}$/i.test(trimmed)) return true;
  return false;
}

function upsertUserDirectoryEntry(
  map: Map<string, UserDirectoryEntry>,
  userId: string,
  patch: Partial<UserDirectoryEntry>,
  updatedAt: number,
): void {
  const existing = map.get(userId);
  if (!existing || updatedAt >= existing.updatedAt) {
    map.set(userId, {
      userId,
      username: patch.username ?? existing?.username,
      displayName: patch.displayName ?? existing?.displayName,
      avatarUrl: patch.avatarUrl ?? existing?.avatarUrl,
      updatedAt,
    });
  }
}

function buildKnownUserDirectory(globalRows?: any[]): Map<string, UserDirectoryEntry> {
  const users = new Map<string, UserDirectoryEntry>();
  const dbView = spacetimeDb.db as any;

  const publicRows: any[] = Array.from(
    dbView?.publicProfileSummary?.iter?.() ?? dbView?.public_profile_summary?.iter?.() ?? [],
  );
  for (const row of publicRows) {
    const userId = asString(row?.userId ?? row?.user_id);
    if (!userId) continue;
    const updatedAt = Date.now();
    upsertUserDirectoryEntry(
      users,
      userId,
      {
        username: asString(row?.username) ?? undefined,
        displayName:
          asString(row?.displayName ?? row?.display_name) ??
          asString(row?.username) ??
          undefined,
        avatarUrl: asString(row?.avatarUrl ?? row?.avatar_url) ?? undefined,
      },
      updatedAt,
    );
  }

  const rows = globalRows ?? getGlobalRowsSortedAsc();
  for (const row of rows) {
    const item = parseJsonRecord(row?.item);
    const eventType = asString(item.eventType);
    const updatedAt = readSpacetimeTimestampMs(row?.createdAt ?? row?.created_at);

    if (eventType === 'user_profile') {
      const userId = asString(item.userId);
      if (!userId) continue;
      upsertUserDirectoryEntry(
        users,
        userId,
        {
          username: asString(item.username) ?? undefined,
          displayName: asString(item.displayName) ?? undefined,
          avatarUrl: asString(item.avatarUrl) ?? undefined,
        },
        updatedAt,
      );
      continue;
    }

    const fromUserId = asString(item.fromUserId);
    if (fromUserId) {
      upsertUserDirectoryEntry(
        users,
        fromUserId,
        {
          username: asString(item.fromUserName) ?? undefined,
          avatarUrl: asString(item.fromUserAvatar) ?? undefined,
        },
        updatedAt,
      );
    }

    const senderId = asString(item.senderId);
    if (senderId) {
      upsertUserDirectoryEntry(
        users,
        senderId,
        {
          username: asString(item.user) ?? undefined,
        },
        updatedAt,
      );
    }
  }

  return users;
}

function resolveUserDisplayName(
  senderId: string | null,
  explicitLabel: string | null | undefined,
  userDirectory: Map<string, UserDirectoryEntry>,
): string {
  const explicit = explicitLabel?.trim();
  if (explicit && (!senderId || !isIdentityLikeName(senderId, explicit))) {
    return explicit;
  }

  if (senderId) {
    const known = userDirectory.get(senderId);
    const displayName = known?.displayName?.trim();
    if (displayName && !isIdentityLikeName(senderId, displayName)) {
      return displayName;
    }
    const username = known?.username?.trim();
    if (username && !isIdentityLikeName(senderId, username)) {
      return username;
    }
  }

  if (explicit) return explicit;
  if (senderId) return senderId;
  return 'User';
}

function parseGlobalMessageRow(
  msgRow: any,
  userDirectory: Map<string, UserDirectoryEntry>,
): GlobalChatMessage | null {
  const parsedItem = parseJsonRecord(msgRow?.item);
  const eventType = asString(parsedItem.eventType);
  if (eventType && eventType !== 'global_chat_message') {
    return null;
  }

  const text = asString(parsedItem.text);
  if (!text) {
    return null;
  }

  const senderId = asString(parsedItem.senderId);
  const user = resolveUserDisplayName(senderId, asString(parsedItem.user), userDirectory);
  const payloadCreatedAt = toFiniteNumber(parsedItem.createdAt);
  const rowCreatedAt = readSpacetimeTimestampMs(msgRow?.createdAt ?? msgRow?.created_at);
  const createdAt = payloadCreatedAt ?? rowCreatedAt;
  const normalizedRoomId =
    asString(msgRow?.roomId) ??
    asString(msgRow?.room_id) ??
    asString(parsedItem.roomId) ??
    asString(parsedItem.room_id) ??
    '';
  const replyToRaw =
    parsedItem.replyTo && typeof parsedItem.replyTo === 'object'
      ? (parsedItem.replyTo as UnknownRecord)
      : null;
  const replyTo =
    replyToRaw && asString(replyToRaw.id) && asString(replyToRaw.text)
      ? {
          id: asString(replyToRaw.id)!,
          user: asString(replyToRaw.user) ?? 'User',
          text: asString(replyToRaw.text)!,
          senderId: asString(replyToRaw.senderId) ?? undefined,
        }
      : null;

  return {
    id: asString(msgRow?.id) ?? asString(parsedItem.id) ?? `st-${createdAt}`,
    roomId: normalizedRoomId,
    user,
    text,
    createdAt,
    senderId: senderId ?? undefined,
    replyTo,
    edited:
      parsedItem.edited === true ||
      toFiniteNumber(parsedItem.editedAt) !== null ||
      toFiniteNumber(parsedItem.edited_at) !== null,
    type: parsedItem.type === 'system' ? 'system' : 'user',
  };
}

function getGlobalRowsSortedAsc(): any[] {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(
    dbView?.globalMessageItem?.iter?.() ?? dbView?.global_message_item?.iter?.() ?? [],
  );
  rows.sort(
    (a, b) =>
      readSpacetimeTimestampMs(a?.createdAt ?? a?.created_at) -
      readSpacetimeTimestampMs(b?.createdAt ?? b?.created_at),
  );
  return rows;
}

function getMyConversationRows(): { rows: any[]; available: boolean } {
  const dbView = spacetimeDb.db as any;
  const fromCamel = dbView?.myConversations?.iter?.();
  if (fromCamel) {
    return { rows: Array.from(fromCamel), available: true };
  }

  const fromSnake = dbView?.my_conversations?.iter?.();
  if (fromSnake) {
    return { rows: Array.from(fromSnake), available: true };
  }

  return { rows: [], available: false };
}

function getMyConversationMessageRows(): { rows: any[]; available: boolean } {
  const dbView = spacetimeDb.db as any;
  const fromCamel = dbView?.myConversationMessages?.iter?.();
  if (fromCamel) {
    return { rows: Array.from(fromCamel), available: true };
  }

  const fromSnake = dbView?.my_conversation_messages?.iter?.();
  if (fromSnake) {
    return { rows: Array.from(fromSnake), available: true };
  }

  return { rows: [], available: false };
}

function parseThreadMessageEvent(item: UnknownRecord): ThreadMessageEvent | null {
  if (asString(item.eventType) !== 'thread_message') {
    return null;
  }

  const fromUserId = asString(item.fromUserId);
  const toUserId = asString(item.toUserId);
  if (!fromUserId || !toUserId) {
    return null;
  }

  const messageRaw =
    item.message && typeof item.message === 'object' ? (item.message as UnknownRecord) : null;
  if (!messageRaw) {
    return null;
  }

  const messageId = asString(messageRaw.id) ?? `thread-${Date.now()}`;
  const messageCreatedAt = toFiniteNumber(messageRaw.createdAt) ?? Date.now();

  const message: ThreadSeedMessage = {
    id: messageId,
    user: asString(messageRaw.user) ?? 'User',
    senderId: asString(messageRaw.senderId) ?? fromUserId,
    text: asString(messageRaw.text) ?? '',
    createdAt: messageCreatedAt,
    deliveredAt: toFiniteNumber(messageRaw.deliveredAt) ?? undefined,
    readAt: toFiniteNumber(messageRaw.readAt) ?? undefined,
    edited: messageRaw.edited === true,
    type:
      messageRaw.type === 'system' ||
      messageRaw.type === 'cash' ||
      messageRaw.type === 'voice'
        ? messageRaw.type
        : 'user',
    amount: toFiniteNumber(messageRaw.amount) ?? undefined,
    audioUrl: asString(messageRaw.audioUrl) ?? undefined,
    duration: toFiniteNumber(messageRaw.duration) ?? undefined,
    media:
      messageRaw.media && typeof messageRaw.media === 'object'
        ? (messageRaw.media as ThreadSeedMessage['media'])
        : undefined,
    replyTo:
      messageRaw.replyTo && typeof messageRaw.replyTo === 'object'
        ? (messageRaw.replyTo as ThreadSeedMessage['replyTo'])
        : undefined,
    reactions: Array.isArray(messageRaw.reactions)
      ? (messageRaw.reactions as ThreadSeedMessage['reactions'])
      : undefined,
  };

  return {
    conversationKey: asString(item.conversationKey) ?? buildConversationKey(fromUserId, toUserId),
    fromUserId,
    toUserId,
    message,
  };
}

function parseConversationReadEvent(item: UnknownRecord): ConversationReadEvent | null {
  if (asString(item.eventType) !== 'conversation_read') {
    return null;
  }

  const readerUserId = asString(item.readerUserId);
  const otherUserId = asString(item.otherUserId);
  if (!readerUserId || !otherUserId) {
    return null;
  }

  const readAt = toFiniteNumber(item.readAt) ?? Date.now();
  return {
    conversationKey: asString(item.conversationKey) ?? buildConversationKey(readerUserId, otherUserId),
    readerUserId,
    otherUserId,
    readAt,
  };
}

function normalizeSenderForViewer(senderId: string, viewerUserId: string | null): string {
  if (viewerUserId && senderId === viewerUserId) {
    return 'me';
  }
  return senderId;
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normalizeThreadMessageType(
  value: unknown,
): ThreadSeedMessage['type'] {
  return value === 'system' || value === 'cash' || value === 'voice' ? value : 'user';
}

function normalizeThreadMessageFromRecord(
  raw: UnknownRecord,
  viewerUserId: string,
  fallbackSenderId: string,
  fallbackUserLabel: string,
  userDirectory: Map<string, UserDirectoryEntry>,
): ThreadSeedMessage {
  const messageId = asString(raw.id) ?? `thread-${Date.now()}`;
  const rawSenderId = asString(raw.senderId) ?? fallbackSenderId;
  const normalizedSenderId = normalizeSenderForViewer(rawSenderId, viewerUserId);
  const createdAt = toNonNegativeInt(readTimestampOrIsoMs(raw.createdAt), Date.now());
  const explicitUser = asString(raw.user);
  const userLabel =
    normalizedSenderId === 'me'
      ? 'You'
      : resolveUserDisplayName(rawSenderId, explicitUser ?? fallbackUserLabel, userDirectory);
  const replyToRaw =
    raw.replyTo && typeof raw.replyTo === 'object' ? (raw.replyTo as UnknownRecord) : null;

  return {
    id: messageId,
    user: userLabel,
    senderId: normalizedSenderId,
    text: asString(raw.text) ?? '',
    createdAt,
    deliveredAt: toFiniteNumber(raw.deliveredAt) ?? createdAt,
    readAt: toFiniteNumber(raw.readAt) ?? undefined,
    edited: raw.edited === true,
    type: normalizeThreadMessageType(raw.type),
    amount: toFiniteNumber(raw.amount) ?? undefined,
    audioUrl: asString(raw.audioUrl) ?? undefined,
    duration: toFiniteNumber(raw.duration) ?? undefined,
    media:
      raw.media && typeof raw.media === 'object'
        ? (raw.media as ThreadSeedMessage['media'])
        : undefined,
    replyTo:
      replyToRaw && asString(replyToRaw.id) && asString(replyToRaw.text)
        ? {
            id: asString(replyToRaw.id)!,
            user: asString(replyToRaw.user) ?? 'User',
            text: asString(replyToRaw.text)!,
            senderId: asString(replyToRaw.senderId) ?? undefined,
          }
        : undefined,
    reactions: Array.isArray(raw.reactions)
      ? (raw.reactions as ThreadSeedMessage['reactions'])
      : undefined,
  };
}

function mergeThreadMessage(
  current: ThreadSeedMessage | undefined,
  incoming: ThreadSeedMessage,
): ThreadSeedMessage {
  if (!current) {
    return incoming;
  }

  return {
    ...current,
    ...incoming,
    createdAt:
      Math.min(
        toNonNegativeInt(current.createdAt, incoming.createdAt),
        toNonNegativeInt(incoming.createdAt, current.createdAt),
      ) || incoming.createdAt,
    deliveredAt:
      Math.max(
        toFiniteNumber(current.deliveredAt) ?? 0,
        toFiniteNumber(incoming.deliveredAt) ?? 0,
      ) || undefined,
    readAt:
      Math.max(toFiniteNumber(current.readAt) ?? 0, toFiniteNumber(incoming.readAt) ?? 0) ||
      undefined,
    user: incoming.user || current.user,
    text: incoming.text || current.text,
    senderId: incoming.senderId || current.senderId,
  };
}

function dedupeAndSortThreadMessages(messages: ThreadSeedMessage[]): ThreadSeedMessage[] {
  const uniqueById = new Map<string, ThreadSeedMessage>();
  for (const message of messages) {
    uniqueById.set(message.id, mergeThreadMessage(uniqueById.get(message.id), message));
  }

  return Array.from(uniqueById.values()).sort((a, b) => {
    const byCreatedAt = toNonNegativeInt(a.createdAt) - toNonNegativeInt(b.createdAt);
    if (byCreatedAt !== 0) return byCreatedAt;
    return a.id.localeCompare(b.id);
  });
}

function parseConversationFromRow(row: any, viewerUserId: string): Conversation | null {
  const ownerUserId = asString(row?.ownerUserId ?? row?.owner_user_id);
  const otherUserId = asString(row?.otherUserId ?? row?.other_user_id);
  if (!ownerUserId || !otherUserId || ownerUserId !== viewerUserId) {
    return null;
  }

  const item = parseJsonRecord(row?.item);
  const lastMessageRaw =
    item.lastMessage && typeof item.lastMessage === 'object'
      ? (item.lastMessage as UnknownRecord)
      : {};
  const createdAtRaw =
    readTimestampOrIsoMs(lastMessageRaw.createdAt) ??
    readSpacetimeTimestampMs(row?.updatedAt ?? row?.updated_at);
  const createdAtIso = new Date(createdAtRaw).toISOString();
  const lastMessageSenderId =
    normalizeSenderForViewer(asString(lastMessageRaw.senderId) ?? otherUserId, viewerUserId);

  return {
    id: asString(item.id) ?? buildConversationKey(ownerUserId, otherUserId),
    otherUserId,
    unreadCount: Math.max(0, toNonNegativeInt(item.unreadCount)),
    lastMessage: {
      id: asString(lastMessageRaw.id) ?? `${createdAtRaw}`,
      senderId: lastMessageSenderId,
      text: asString(lastMessageRaw.text) ?? '',
      createdAt: createdAtIso,
      deliveredAt: toFiniteNumber(lastMessageRaw.deliveredAt) ?? createdAtRaw,
      readAt: toFiniteNumber(lastMessageRaw.readAt) ?? undefined,
    },
  };
}

function buildConversationsFromRows(rows: any[], viewerUserId: string): Conversation[] {
  const byOtherUserId = new Map<string, Conversation>();
  for (const row of rows) {
    const parsed = parseConversationFromRow(row, viewerUserId);
    if (!parsed) continue;
    const existing = byOtherUserId.get(parsed.otherUserId);
    if (!existing) {
      byOtherUserId.set(parsed.otherUserId, parsed);
      continue;
    }
    const existingTs = Date.parse(existing.lastMessage.createdAt);
    const nextTs = Date.parse(parsed.lastMessage.createdAt);
    if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs >= existingTs)) {
      byOtherUserId.set(parsed.otherUserId, parsed);
    }
  }

  return Array.from(byOtherUserId.values()).sort((a, b) => {
    const aTs = Date.parse(a.lastMessage.createdAt);
    const bTs = Date.parse(b.lastMessage.createdAt);
    return bTs - aTs;
  });
}

function buildThreadMessagesFromRows(
  rows: any[],
  viewerUserId: string,
  otherUserId: string,
  userDirectory: Map<string, UserDirectoryEntry>,
): ThreadSeedMessage[] {
  const normalizedOtherUserId = otherUserId.trim();
  const messages: ThreadSeedMessage[] = [];
  for (const row of rows) {
    const ownerUserId = asString(row?.ownerUserId ?? row?.owner_user_id);
    const rowOtherUserId = asString(row?.otherUserId ?? row?.other_user_id);
    if (!ownerUserId || !rowOtherUserId) continue;
    if (ownerUserId !== viewerUserId || rowOtherUserId !== normalizedOtherUserId) continue;

    const messageItems = parseJsonArray(row?.messages);
    for (const entry of messageItems) {
      if (!entry || typeof entry !== 'object') continue;
      messages.push(
        normalizeThreadMessageFromRecord(
          entry as UnknownRecord,
          viewerUserId,
          rowOtherUserId,
          rowOtherUserId,
          userDirectory,
        ),
      );
    }
  }

  return dedupeAndSortThreadMessages(messages);
}

function buildConversationFromEvents(
  rows: any[],
  viewerUserId: string,
): Conversation[] {
  const threadEventsByOther = new Map<string, ThreadMessageEvent[]>();
  const readEventsByConversation = new Map<string, ConversationReadEvent[]>();

  for (const row of rows) {
    const item = parseJsonRecord(row?.item);
    const threadEvent = parseThreadMessageEvent(item);
    if (threadEvent) {
      const { fromUserId, toUserId } = threadEvent;
      if (fromUserId !== viewerUserId && toUserId !== viewerUserId) {
        continue;
      }
      const otherUserId = fromUserId === viewerUserId ? toUserId : fromUserId;
      const existing = threadEventsByOther.get(otherUserId) ?? [];
      existing.push(threadEvent);
      threadEventsByOther.set(otherUserId, existing);
      continue;
    }

    const readEvent = parseConversationReadEvent(item);
    if (readEvent) {
      const existing = readEventsByConversation.get(readEvent.conversationKey) ?? [];
      existing.push(readEvent);
      readEventsByConversation.set(readEvent.conversationKey, existing);
    }
  }

  const conversations: Conversation[] = [];
  for (const [otherUserId, events] of threadEventsByOther) {
    if (events.length === 0) continue;
    const ordered = [...events].sort(
      (a, b) => (a.message.createdAt ?? 0) - (b.message.createdAt ?? 0),
    );
    const lastEvent = ordered[ordered.length - 1];
    const conversationKey = buildConversationKey(viewerUserId, otherUserId);
    const readEvents = readEventsByConversation.get(conversationKey) ?? [];

    let latestReadByViewer = 0;
    let latestReadByOther = 0;
    for (const readEvent of readEvents) {
      if (readEvent.readerUserId === viewerUserId) {
        latestReadByViewer = Math.max(latestReadByViewer, readEvent.readAt);
      } else if (readEvent.readerUserId === otherUserId) {
        latestReadByOther = Math.max(latestReadByOther, readEvent.readAt);
      }
    }

    const unreadCount = ordered.reduce((count, event) => {
      const messageCreatedAt = event.message.createdAt ?? 0;
      if (event.fromUserId === viewerUserId) return count;
      if (messageCreatedAt <= latestReadByViewer) return count;
      return count + 1;
    }, 0);

    const lastMessageCreatedAt = lastEvent.message.createdAt ?? Date.now();
    const lastMessageSenderId = normalizeSenderForViewer(lastEvent.fromUserId, viewerUserId);

    conversations.push({
      id: conversationKey,
      otherUserId,
      lastMessage: {
        id: lastEvent.message.id,
        senderId: lastMessageSenderId,
        text: lastEvent.message.text,
        createdAt: new Date(lastMessageCreatedAt).toISOString(),
        deliveredAt: lastEvent.message.deliveredAt ?? lastMessageCreatedAt,
        readAt:
          lastMessageSenderId === 'me' && latestReadByOther >= lastMessageCreatedAt
            ? latestReadByOther
            : lastEvent.message.readAt,
      },
      unreadCount,
    });
  }

  conversations.sort((a, b) => {
    const aTs = Date.parse(a.lastMessage.createdAt);
    const bTs = Date.parse(b.lastMessage.createdAt);
    return bTs - aTs;
  });

  return conversations;
}

function buildThreadMessagesFromEvents(
  rows: any[],
  viewerUserId: string,
  otherUserId: string,
  userDirectory: Map<string, UserDirectoryEntry>,
): ThreadSeedMessage[] {
  const conversationKey = buildConversationKey(viewerUserId, otherUserId);
  const messageEvents: ThreadMessageEvent[] = [];
  const readEvents: ConversationReadEvent[] = [];

  for (const row of rows) {
    const item = parseJsonRecord(row?.item);
    const threadEvent = parseThreadMessageEvent(item);
    if (threadEvent && threadEvent.conversationKey === conversationKey) {
      messageEvents.push(threadEvent);
      continue;
    }
    const readEvent = parseConversationReadEvent(item);
    if (readEvent && readEvent.conversationKey === conversationKey) {
      readEvents.push(readEvent);
    }
  }

  let latestReadByOther = 0;
  for (const event of readEvents) {
    if (event.readerUserId === otherUserId) {
      latestReadByOther = Math.max(latestReadByOther, event.readAt);
    }
  }

  const messages = messageEvents
    .map((event) => {
      const message = { ...event.message };
      const isMine = event.fromUserId === viewerUserId;
      const createdAt = message.createdAt ?? Date.now();
      const normalizedSenderId = normalizeSenderForViewer(event.fromUserId, viewerUserId);
      return {
        ...message,
        senderId: normalizedSenderId,
        user:
          normalizedSenderId === 'me'
            ? 'You'
            : resolveUserDisplayName(event.fromUserId, message.user, userDirectory),
        deliveredAt: message.deliveredAt ?? createdAt,
        readAt:
          isMine && latestReadByOther >= createdAt
            ? latestReadByOther
            : message.readAt,
      };
    })
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  return dedupeAndSortThreadMessages(messages);
}

function parsePositiveLimit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

type ViewHydrationStateReader = {
  isViewRequested?: (viewName: string) => boolean;
  isViewActive?: (viewName: string) => boolean;
};

export function createBackendMessagesRepository(
  snapshot: BackendSnapshot,
  _client: BackendHttpClient | null,
  viewerUserId: string | null = null,
  viewStateReader: ViewHydrationStateReader = {},
): MessagesRepository {
  const normalizeSenderId = (senderId: string) =>
    viewerUserId && senderId === viewerUserId ? 'me' : senderId;
  const isViewRequested = viewStateReader.isViewRequested ?? isSpacetimeViewRequested;
  const isViewActive = viewStateReader.isViewActive ?? isSpacetimeViewActive;

  return {
    listConversations(request) {
      const viewerKey = viewerUserId ?? '__anon__';
      const globalRows = getGlobalRowsSortedAsc();
      const { rows: conversationRows, available: conversationRowsAvailable } = getMyConversationRows();
      const conversationViewRequested = isViewRequested('my_conversations');
      const conversationViewActive = isViewActive('my_conversations');
      const shouldUseAuthoritativeConversationRows =
        Boolean(viewerUserId) &&
        conversationRowsAvailable &&
        (conversationViewRequested || conversationViewActive || conversationRows.length > 0);
      const spacetimeConversations =
        viewerUserId ? buildConversationFromEvents(globalRows, viewerUserId) : [];
      const byOtherUser = new Map<string, Conversation>();
      for (const conversation of snapshot.conversations) {
        byOtherUser.set(conversation.otherUserId, {
          ...conversation,
          lastMessage: {
            ...conversation.lastMessage,
            senderId: normalizeSenderId(conversation.lastMessage.senderId),
          },
        });
      }
      for (const conversation of spacetimeConversations) {
        byOtherUser.set(conversation.otherUserId, conversation);
      }

      const mergedConversations = Array.from(byOtherUser.values()).sort((a, b) => {
        const aTs = Date.parse(a.lastMessage.createdAt);
        const bTs = Date.parse(b.lastMessage.createdAt);
        return bTs - aTs;
      });

      if (mergedConversations.length > 0) {
        conversationsCacheByViewer.set(viewerKey, mergedConversations);
      }
      const fallbackConversations =
        mergedConversations.length > 0
          ? mergedConversations
          : conversationsCacheByViewer.get(viewerKey) ?? mergedConversations;

      let sourceConversations = fallbackConversations;
      if (shouldUseAuthoritativeConversationRows && viewerUserId) {
        const authoritativeConversations = buildConversationsFromRows(conversationRows, viewerUserId);
        if (authoritativeConversations.length > 0) {
          conversationsCacheByViewer.set(viewerKey, authoritativeConversations);
          sourceConversations = authoritativeConversations;
        }
      }

      const searched = filterByQuery(sourceConversations, request?.query, [
        (conversation) => conversation.otherUserId,
        (conversation) => conversation.lastMessage.text,
      ]);
      return applyCursorPage(searched, request);
    },
    listGlobalMessages(request) {
      const requestedRoomId = request?.roomId?.trim();
      const requestedRoomIdLower = requestedRoomId?.toLowerCase();
      const globalRows = getGlobalRowsSortedAsc();
      const userDirectory = buildKnownUserDirectory(globalRows);
      const stMessages = globalRows
        .map((msgRow: any) => parseGlobalMessageRow(msgRow, userDirectory))
        .filter((msg): msg is GlobalChatMessage => !!msg);

      const filtered = stMessages.filter((message) => {
        const messageRoomId = typeof message.roomId === 'string' ? message.roomId.trim() : '';
        const messageRoomIdLower = messageRoomId.toLowerCase();
        if (requestedRoomId) {
          return messageRoomIdLower === requestedRoomIdLower;
        }
        return messageRoomId.length === 0 || messageRoomIdLower === 'global';
      });
      const roomCacheKey = requestedRoomIdLower ?? '__global_default__';
      if (filtered.length > 0) {
        globalMessagesCacheByRoom.set(roomCacheKey, filtered);
      }
      const sourceMessages =
        filtered.length > 0 ? filtered : globalMessagesCacheByRoom.get(roomCacheKey) ?? filtered;

      // Global chat should show the most recent messages by default.
      if (request?.cursor) {
        return applyCursorPage(sourceMessages, request);
      }

      const limit = parsePositiveLimit(request?.limit);
      if (!limit) {
        return sourceMessages;
      }
      if (sourceMessages.length <= limit) {
        return sourceMessages;
      }
      if (__DEV__) {
        console.log(
          `[data/messages] global chat rows=${sourceMessages.length}, returning latest=${limit}`,
        );
      }
      return sourceMessages.slice(sourceMessages.length - limit);
    },
    listMentionUsers(request) {
      const searched = filterByQuery(snapshot.mentionUsers, request?.query, [
        (user) => user.name,
      ]);
      return applyCursorPage(searched, request);
    },
    listThreadSeedMessages(userId) {
      const cacheKey = viewerUserId ? `${viewerUserId}::${userId}` : `__anon__::${userId}`;
      const globalRows = getGlobalRowsSortedAsc();
      const userDirectory = buildKnownUserDirectory(globalRows);
      const { rows: threadRows, available: threadRowsAvailable } = getMyConversationMessageRows();
      const threadViewRequested = isViewRequested('my_conversation_messages');
      const threadViewActive = isViewActive('my_conversation_messages');
      const shouldUseAuthoritativeThreadRows =
        Boolean(viewerUserId) &&
        threadRowsAvailable &&
        (threadViewRequested || threadViewActive || threadRows.length > 0);

      if (shouldUseAuthoritativeThreadRows && viewerUserId) {
        const hasTargetRow = threadRows.some((row) => {
          const ownerUserId = asString(row?.ownerUserId ?? row?.owner_user_id);
          const rowOtherUserId = asString(row?.otherUserId ?? row?.other_user_id);
          return ownerUserId === viewerUserId && rowOtherUserId === userId;
        });
        const rowMessages = buildThreadMessagesFromRows(
          threadRows,
          viewerUserId,
          userId,
          userDirectory,
        );

        if (rowMessages.length > 0) {
          threadMessagesCacheByConversation.set(cacheKey, rowMessages);
          return rowMessages;
        }

        if (hasTargetRow) {
          threadMessagesCacheByConversation.delete(cacheKey);
          return [];
        }

        if (threadRows.length > 0) {
          threadMessagesCacheByConversation.delete(cacheKey);
          return [];
        }
      }

      const spacetimeMessages =
        viewerUserId && userId
          ? buildThreadMessagesFromEvents(globalRows, viewerUserId, userId, userDirectory)
          : [];

      if (spacetimeMessages.length > 0) {
        threadMessagesCacheByConversation.set(cacheKey, spacetimeMessages);
        return spacetimeMessages;
      }

      const cached = threadMessagesCacheByConversation.get(cacheKey);
      if (cached && cached.length > 0) {
        return cached;
      }

      const rawMessages = snapshot.threadSeedMessagesByUserId[userId] ?? [];
      const snapshotMessages = rawMessages.map((message) => {
        if (!viewerUserId) {
          return message;
        }
        return normalizeThreadMessageFromRecord(
          message as unknown as UnknownRecord,
          viewerUserId,
          asString(message.senderId) ?? userId,
          userId,
          userDirectory,
        );
      });
      return dedupeAndSortThreadMessages(snapshotMessages);
    },
    async sendThreadMessage(request) {
      if (!request.userId) return;

      const senderCandidate = asString(request.message.senderId);
      const resolvedSenderId =
        senderCandidate === 'me'
          ? viewerUserId ?? asString(request.fromUserId) ?? 'me'
          : senderCandidate ?? viewerUserId ?? asString(request.fromUserId) ?? 'me';
      const recipientId = request.userId;
      const conversationKey = buildConversationKey(resolvedSenderId, recipientId);
      const now = Date.now();
      const createdAt =
        typeof request.message.createdAt === 'number' && Number.isFinite(request.message.createdAt)
          ? request.message.createdAt
          : now;
      const clientId = request.clientMessageId ?? request.message.id ?? `thread-${now}`;

      const eventPayload = {
        eventType: 'thread_message',
        conversationKey,
        fromUserId: resolvedSenderId,
        toUserId: recipientId,
        message: {
          ...request.message,
          id: clientId,
          senderId: resolvedSenderId,
          createdAt,
          user:
            request.message.user &&
            request.message.user.trim().length > 0 &&
            request.message.user.trim().toLowerCase() !== 'you'
              ? request.message.user
              : resolvedSenderId,
        },
      };

      try {
        const reducers = spacetimeDb.reducers as any;
        if (typeof reducers?.sendThreadMessage === 'function') {
          await reducers.sendThreadMessage({
            id: clientId,
            conversationKey,
            fromUserId: resolvedSenderId,
            toUserId: recipientId,
            message: JSON.stringify(eventPayload.message),
          });
        } else {
          await reducers.sendGlobalMessage({
            id: clientId,
            roomId: `dm:${conversationKey}`,
            item: JSON.stringify(eventPayload),
          });
        }
        requestBackendRefresh({
          scopes: ['messages', 'conversations', 'counts'],
          source: 'manual',
          reason: 'thread_message_sent_spacetimedb',
        });
        return;
      } catch (error) {
        if (__DEV__) {
          console.warn('[data/messages] Failed to send thread message via SpacetimeDB', error);
        }
        throw error instanceof Error ? error : new Error('Failed to send thread message.');
      }
    },
    async markConversationRead(request) {
      if (!request.userId) return;

      const readerUserId = asString(request.readerUserId) ?? viewerUserId;
      if (readerUserId) {
        const conversationKey = buildConversationKey(readerUserId, request.userId);
        try {
          const reducers = spacetimeDb.reducers as any;
          const readAt = Date.now();
          if (typeof reducers?.markConversationRead === 'function') {
            await reducers.markConversationRead({
              id: `read-${conversationKey}-${readAt}`,
              conversationKey,
              readerUserId,
              otherUserId: request.userId,
              readAt: String(readAt),
            });
          } else {
            await reducers.sendGlobalMessage({
              id: `read-${conversationKey}-${readAt}`,
              roomId: `dm:${conversationKey}`,
              item: JSON.stringify({
                eventType: 'conversation_read',
                conversationKey,
                readerUserId,
                otherUserId: request.userId,
                readAt,
              }),
            });
          }
          requestBackendRefresh({
            scopes: ['messages', 'conversations', 'counts'],
            source: 'manual',
            reason: 'conversation_mark_read_spacetimedb',
          });
          return;
        } catch (error) {
          if (__DEV__) {
            console.warn('[data/messages] Failed to mark conversation as read via SpacetimeDB', error);
          }
        }
      }
    },
    async sendGlobalMessage(request) {
      const clientId = request.clientMessageId ?? request.message.id;
      const roomId = request.roomId?.trim() || 'global';
      const senderId = asString(request.message.senderId) ?? viewerUserId ?? undefined;
      const requestedUserLabel = asString(request.message.user);
      const userDirectory = buildKnownUserDirectory();
      const senderLabel = resolveUserDisplayName(senderId ?? null, requestedUserLabel, userDirectory);
      const normalizedUserLabel =
        requestedUserLabel &&
        requestedUserLabel.toLowerCase() !== 'you' &&
        requestedUserLabel.toLowerCase() !== 'me' &&
        requestedUserLabel.toLowerCase() !== 'user' &&
        (!senderId || !isIdentityLikeName(senderId, requestedUserLabel))
          ? requestedUserLabel
          : senderLabel;

      const itemPayload = JSON.stringify({
        id: clientId,
        roomId,
        eventType: 'global_chat_message',
        user: normalizedUserLabel,
        senderId,
        replyTo:
          request.message.replyTo &&
          request.message.replyTo.id &&
          request.message.replyTo.text
            ? {
                id: request.message.replyTo.id,
                user: request.message.replyTo.user,
                text: request.message.replyTo.text,
                senderId: request.message.replyTo.senderId,
              }
            : undefined,
        text: request.message.text,
        type: request.message.type || 'user',
        createdAt:
          typeof request.message.createdAt === 'number' && Number.isFinite(request.message.createdAt)
            ? request.message.createdAt
            : Date.now(),
      });

      await (spacetimeDb.reducers as any).sendGlobalMessage({
        id: clientId,
        roomId,
        item: itemPayload,
      });
      requestBackendRefresh({
        scopes: ['global_messages'],
        source: 'manual',
        reason: 'global_message_sent_spacetimedb',
      });
    },
    async editGlobalMessage(request) {
      const messageId = asString(request.messageId);
      const nextText = request.text?.trim();
      if (!messageId || !nextText) {
        throw new Error('A message id and non-empty text are required.');
      }

      const reducers = spacetimeDb.reducers as any;
      if (typeof reducers.editGlobalMessage !== 'function') {
        throw new Error('SpacetimeDB reducers are unavailable.');
      }

      await reducers.editGlobalMessage({
        id: messageId,
        text: nextText,
      });
      requestBackendRefresh({
        scopes: ['global_messages'],
        source: 'manual',
        reason: 'global_message_edited_spacetimedb',
      });
    },
    async deleteGlobalMessage(request) {
      const messageId = asString(request.messageId);
      if (!messageId) {
        throw new Error('A message id is required.');
      }

      const reducers = spacetimeDb.reducers as any;
      if (typeof reducers.deleteGlobalMessage !== 'function') {
        throw new Error('SpacetimeDB reducers are unavailable.');
      }

      await reducers.deleteGlobalMessage({
        id: messageId,
      });
      requestBackendRefresh({
        scopes: ['global_messages'],
        source: 'manual',
        reason: 'global_message_deleted_spacetimedb',
      });
    },
  };
}
