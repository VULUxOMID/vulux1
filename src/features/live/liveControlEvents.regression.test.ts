import test from 'node:test';
import assert from 'node:assert/strict';

import {
  derivePendingHostInviteIds,
  derivePendingHostRequestIds,
  parseLiveControlEvents,
} from './liveControlEvents';

function makeRow(roomId: string, payload: Record<string, unknown>, createdAt: number) {
  return {
    roomId,
    createdAt,
    item: JSON.stringify(payload),
  };
}

test('host request lifecycle tracks pending until response', () => {
  const rows = [
    makeRow('live-1', { eventType: 'live_host_request', requesterUserId: 'viewer-1' }, 1),
    makeRow('live-1', { eventType: 'live_host_request_response', targetUserId: 'viewer-1', accepted: false }, 2),
  ];

  const events = parseLiveControlEvents(rows, 'live-1');
  const pending = derivePendingHostRequestIds(events);
  assert.deepEqual(pending, []);
});

test('host invite lifecycle tracks pending until response', () => {
  const rows = [
    makeRow('live-1', { eventType: 'live_invite', targetUserId: 'viewer-2' }, 1),
    makeRow('live-1', { eventType: 'live_invite_response', targetUserId: 'viewer-2', accepted: true }, 2),
  ];

  const events = parseLiveControlEvents(rows, 'live-1');
  const pending = derivePendingHostInviteIds(events);
  assert.deepEqual(pending, []);
});

test('invite replay response without fresh invite stays non-pending', () => {
  const rows = [
    makeRow('live-1', { eventType: 'live_invite', targetUserId: 'viewer-3' }, 1),
    makeRow('live-1', { eventType: 'live_invite_response', targetUserId: 'viewer-3', accepted: false }, 2),
    makeRow('live-1', { eventType: 'live_invite_response', targetUserId: 'viewer-3', accepted: true }, 3),
  ];

  const events = parseLiveControlEvents(rows, 'live-1');
  const pending = derivePendingHostInviteIds(events);
  assert.deepEqual(pending, []);
});

test('control events are room-scoped', () => {
  const rows = [
    makeRow('live-1', { eventType: 'live_host_request', requesterUserId: 'viewer-1' }, 1),
    makeRow('live-2', { eventType: 'live_host_request', requesterUserId: 'viewer-2' }, 2),
  ];

  const events = parseLiveControlEvents(rows, 'live-1');
  const pending = derivePendingHostRequestIds(events);
  assert.deepEqual(pending, ['viewer-1']);
});
