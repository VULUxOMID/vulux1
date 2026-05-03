import type { ActivityNotification } from './types';

type NotificationNavigationAction =
  | {
      type: 'open_dm';
      userId: string;
      userName?: string;
      messageId?: string;
      replyToMessageId?: string;
      metadata?: Record<string, any>;
    }
  | {
      type: 'open_chat';
      chatId?: string;
      messageId?: string;
      replyToMessageId?: string;
      metadata?: Record<string, any>;
    }
  | {
      type: 'open_room';
      roomId: string;
      messageId?: string;
      replyToMessageId?: string;
      metadata?: Record<string, any>;
    }
  | {
      type: 'open_live';
      liveId: string;
      eventMessageId?: string;
    };

type NavigationIntent = 'open' | 'reply';

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveActivityNotificationNavigation(
  item: ActivityNotification,
  intent: NavigationIntent = 'open',
): NotificationNavigationAction | null {
  const metadata = item.metadata ?? {};
  const messageId = readNonEmptyString(metadata.messageId);

  switch (item.activityType) {
    case 'money_received':
      if (!item.fromUser?.id) {
        return null;
      }
      return {
        type: 'open_dm',
        userId: item.fromUser.id,
        userName: item.fromUser.name,
        messageId,
      };

    case 'mention':
    case 'reply': {
      const replyToMessageId =
        intent === 'reply' ? messageId : readNonEmptyString(metadata.replyToMessageId);
      const conversationKey = readNonEmptyString(metadata.conversationKey);
      const roomId = readNonEmptyString(metadata.roomId);

      if (conversationKey && item.fromUser?.id) {
        return {
          type: 'open_dm',
          userId: item.fromUser.id,
          userName: item.fromUser.name,
          messageId,
          replyToMessageId,
          metadata,
        };
      }

      if (roomId && roomId.toLowerCase() !== 'global') {
        return {
          type: 'open_room',
          roomId,
          messageId,
          replyToMessageId,
          metadata,
        };
      }

      return {
        type: 'open_chat',
        chatId: readNonEmptyString(metadata.chatId),
        messageId,
        replyToMessageId,
        metadata,
      };
    }

    case 'live_invite': {
      const liveId =
        readNonEmptyString(metadata.liveId) ??
        readNonEmptyString(metadata.roomId) ??
        readNonEmptyString(metadata.streamId);
      return liveId ? { type: 'open_live', liveId } : null;
    }

    case 'event': {
      const liveId =
        readNonEmptyString(metadata.liveId) ??
        readNonEmptyString(metadata.roomId) ??
        readNonEmptyString(metadata.streamId);
      return liveId
        ? {
            type: 'open_live',
            liveId,
            eventMessageId: readNonEmptyString(metadata.eventMessageId),
          }
        : null;
    }

    default:
      return null;
  }
}
