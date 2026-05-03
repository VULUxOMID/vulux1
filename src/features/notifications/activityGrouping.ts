const ACTIVITY_GROUP_CONTEXT_KEYS = [
  'eventMessageId',
  'messageId',
  'replyToMessageId',
  'liveId',
  'streamId',
  'conversationKey',
  'chatId',
  'roomId',
  'conversationId',
  'postId',
  'threadId',
  'commentId',
  'contextId',
] as const;

export function getActivityContextKey(metadata?: Record<string, any>): string {
  if (!metadata || typeof metadata !== 'object') {
    return 'none';
  }

  for (const key of ACTIVITY_GROUP_CONTEXT_KEYS) {
    const value = metadata[key];
    if (value !== undefined && value !== null && `${value}`.trim().length > 0) {
      return `${key}:${value}`;
    }
  }

  return 'none';
}
