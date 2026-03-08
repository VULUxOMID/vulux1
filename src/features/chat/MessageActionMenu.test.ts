import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMessageActionItems } from './messageActionConfig';

test('DM-safe action list omits edit/delete when own-message mutations are unsupported', () => {
  const actions = resolveMessageActionItems(true, false);

  assert.deepEqual(
    actions.map((action) => action.id),
    ['reply', 'copy'],
  );
});

test('non-owner action list still keeps report available', () => {
  const actions = resolveMessageActionItems(false, false);

  assert.deepEqual(
    actions.map((action) => action.id),
    ['reply', 'copy', 'report'],
  );
});
