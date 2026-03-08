export function shouldShowMessagesLoading(
  hasConversations: boolean,
  canSyncMessages: boolean,
  conversationViewActive: boolean,
): boolean {
  if (!canSyncMessages) {
    return false;
  }

  if (hasConversations) {
    return false;
  }

  return !conversationViewActive;
}
