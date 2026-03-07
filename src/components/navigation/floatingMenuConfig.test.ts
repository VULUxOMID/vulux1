import test from 'node:test';
import assert from 'node:assert/strict';

import { ADMIN_MENU_ITEMS, MENU_ITEMS } from './floatingMenuConfig';

test('floating menu items expose visible labels and accessibility labels', () => {
  const items = [...MENU_ITEMS, ...ADMIN_MENU_ITEMS];

  assert.ok(items.length > 0);
  items.forEach((item) => {
    assert.notEqual(item.label.trim(), '');
    assert.notEqual(item.accessibilityLabel.trim(), '');
    assert.ok(item.route.startsWith('/'));
  });
});

test('admin menu labels remain distinct from consumer destinations', () => {
  assert.deepEqual(
    ADMIN_MENU_ITEMS.map((item) => item.label),
    ['Admin', 'Admin Ops'],
  );
});
