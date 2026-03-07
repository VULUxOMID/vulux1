import test from 'node:test';
import assert from 'node:assert/strict';

import { LIVE_EMPTY_STATE, shouldShowLiveEmptyState } from './liveEmptyState';

test('live empty state copy is explicit and actionable', () => {
  assert.match(LIVE_EMPTY_STATE.title, /no live rooms/i);
  assert.match(LIVE_EMPTY_STATE.description, /nobody is live/i);
  assert.match(LIVE_EMPTY_STATE.ctaLabel, /go live/i);
});

test('empty state only shows when loading is complete and no lives exist', () => {
  assert.equal(shouldShowLiveEmptyState({ loading: true, livesCount: 0 }), false);
  assert.equal(shouldShowLiveEmptyState({ loading: false, livesCount: 1 }), false);
  assert.equal(shouldShowLiveEmptyState({ loading: false, livesCount: 0 }), true);
});
