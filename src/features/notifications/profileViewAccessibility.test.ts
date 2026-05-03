import test from 'node:test';
import assert from 'node:assert/strict';

import { getProfileViewsPillAccessibilityLabel } from './profileViewAccessibility';

test('includes unread profile-view count when unread rows exist', () => {
  assert.equal(
    getProfileViewsPillAccessibilityLabel(12, 3),
    'Profile views, 12 total views, 3 unread profile view notifications',
  );
});

test('omits unread copy when there are no unread profile views', () => {
  assert.equal(
    getProfileViewsPillAccessibilityLabel(12, 0),
    'Profile views, 12 total views',
  );
});
