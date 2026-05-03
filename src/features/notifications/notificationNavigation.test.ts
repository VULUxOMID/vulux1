import test from 'node:test';
import assert from 'node:assert/strict';

import type { ActivityNotification } from './types';
import { resolveActivityNotificationNavigation } from './notificationNavigation';

const baseMention = (): ActivityNotification => ({
  id: 'mention-1',
  type: 'activity',
  activityType: 'mention',
  createdAt: 1_000,
  read: false,
  fromUser: {
    id: 'friend-1',
    name: 'Alice',
  },
  message: 'mentioned you.',
  metadata: {
    messageId: 'msg-1',
  },
});

test('routes DM mention notifications to the 1:1 thread', () => {
  const action = resolveActivityNotificationNavigation(
    {
      ...baseMention(),
      metadata: {
        conversationKey: 'friend-1::viewer-1',
        messageId: 'msg-1',
      },
    },
    'open',
  );

  assert.deepEqual(action, {
    type: 'open_dm',
    userId: 'friend-1',
    userName: 'Alice',
    messageId: 'msg-1',
    replyToMessageId: undefined,
    metadata: {
      conversationKey: 'friend-1::viewer-1',
      messageId: 'msg-1',
    },
  });
});

test('routes DM reply quick actions to the 1:1 thread with reply target', () => {
  const action = resolveActivityNotificationNavigation(
    {
      ...baseMention(),
      activityType: 'reply',
      metadata: {
        conversationKey: 'friend-1::viewer-1',
        messageId: 'msg-2',
      },
    },
    'reply',
  );

  assert.deepEqual(action, {
    type: 'open_dm',
    userId: 'friend-1',
    userName: 'Alice',
    messageId: 'msg-2',
    replyToMessageId: 'msg-2',
    metadata: {
      conversationKey: 'friend-1::viewer-1',
      messageId: 'msg-2',
    },
  });
});

test('keeps global mention notifications on the global chat path', () => {
  const action = resolveActivityNotificationNavigation(
    {
      ...baseMention(),
      metadata: {
        roomId: 'global',
        messageId: 'msg-3',
      },
    },
    'open',
  );

  assert.deepEqual(action, {
    type: 'open_chat',
    chatId: undefined,
    messageId: 'msg-3',
    replyToMessageId: undefined,
    metadata: {
      roomId: 'global',
      messageId: 'msg-3',
    },
  });
});

test('routes room mention notifications to the room screen', () => {
  const action = resolveActivityNotificationNavigation(
    {
      ...baseMention(),
      metadata: {
        roomId: 'group-room-7',
        messageId: 'msg-room-1',
      },
    },
    'open',
  );

  assert.deepEqual(action, {
    type: 'open_room',
    roomId: 'group-room-7',
    messageId: 'msg-room-1',
    replyToMessageId: undefined,
    metadata: {
      roomId: 'group-room-7',
      messageId: 'msg-room-1',
    },
  });
});

test('routes room reply quick actions to the room screen with reply target', () => {
  const action = resolveActivityNotificationNavigation(
    {
      ...baseMention(),
      activityType: 'reply',
      metadata: {
        roomId: 'group-room-8',
        messageId: 'msg-room-2',
      },
    },
    'reply',
  );

  assert.deepEqual(action, {
    type: 'open_room',
    roomId: 'group-room-8',
    messageId: 'msg-room-2',
    replyToMessageId: 'msg-room-2',
    metadata: {
      roomId: 'group-room-8',
      messageId: 'msg-room-2',
    },
  });
});

test('routes money-received notifications to the sender DM thread', () => {
  const action = resolveActivityNotificationNavigation({
    id: 'money-1',
    type: 'activity',
    activityType: 'money_received',
    createdAt: 2_000,
    read: false,
    fromUser: {
      id: 'friend-cash',
      name: 'Cash Friend',
    },
    message: 'sent you cash.',
    metadata: {
      messageId: 'cash-msg-1',
    },
  });

  assert.deepEqual(action, {
    type: 'open_dm',
    userId: 'friend-cash',
    userName: 'Cash Friend',
    messageId: 'cash-msg-1',
  });
});

test('routes live invites to the live screen', () => {
  const action = resolveActivityNotificationNavigation({
    id: 'live-1',
    type: 'activity',
    activityType: 'live_invite',
    createdAt: 3_000,
    read: false,
    fromUser: {
      id: 'host-1',
      name: 'Host',
    },
    message: 'invited you to join their live.',
    metadata: {
      liveId: 'live-room-7',
    },
  });

  assert.deepEqual(action, {
    type: 'open_live',
    liveId: 'live-room-7',
  });
});

test('routes event-winner notifications to the live screen', () => {
  const action = resolveActivityNotificationNavigation({
    id: 'event-1',
    type: 'activity',
    activityType: 'event',
    createdAt: 4_000,
    read: false,
    message: 'You won the event draw!',
    metadata: {
      liveId: 'live-room-9',
      eventMessageId: 'event-msg-1',
    },
  });

  assert.deepEqual(action, {
    type: 'open_live',
    liveId: 'live-room-9',
    eventMessageId: 'event-msg-1',
  });
});
