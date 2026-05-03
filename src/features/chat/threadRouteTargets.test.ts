import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveThreadRouteTargets } from './threadRouteTargets';

const messages = [
  { id: 'msg-1' },
  { id: 'msg-2' },
  { id: 'msg-3' },
];

test('resolves focus and reply targets from string params', () => {
  const targets = resolveThreadRouteTargets(messages, {
    messageId: 'msg-2',
    replyToMessageId: 'msg-1',
  });

  assert.equal(targets.focusMessage?.id, 'msg-2');
  assert.equal(targets.replyToMessage?.id, 'msg-1');
});

test('supports array route params from expo-router', () => {
  const targets = resolveThreadRouteTargets(messages, {
    messageId: ['msg-3'],
    replyToMessageId: ['msg-2'],
  });

  assert.equal(targets.focusMessage?.id, 'msg-3');
  assert.equal(targets.replyToMessage?.id, 'msg-2');
});

test('returns null when params are missing or unmatched', () => {
  const targets = resolveThreadRouteTargets(messages, {
    messageId: 'missing',
    replyToMessageId: undefined,
  });

  assert.equal(targets.focusMessage, null);
  assert.equal(targets.replyToMessage, null);
});
