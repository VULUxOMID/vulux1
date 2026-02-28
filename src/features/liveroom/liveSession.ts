import type { ChatMessage, LiveUser } from './types';

export const liveSessionUser: LiveUser = {
  id: 'current-user',
  name: 'You',
  username: 'you',
  age: 0,
  verified: false,
  country: '',
  bio: '',
  avatarUrl: '',
};

export function createChatMessage(
  text: string,
  user?: LiveUser,
  type: 'user' | 'system' = 'user',
  systemType?: ChatMessage['systemType'],
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    user,
    text,
    timestamp: Date.now(),
    systemType,
    ...extra,
  };
}
