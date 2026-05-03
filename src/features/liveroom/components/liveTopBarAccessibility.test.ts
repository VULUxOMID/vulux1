import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLiveProfileViewsAccessibilityLabel,
  getLiveViewerCountAccessibilityLabel,
} from './liveTopBarAccessibility';

test('describes a single live viewer', () => {
  assert.equal(getLiveViewerCountAccessibilityLabel(1), '1 viewer in the live');
});

test('describes multiple live viewers', () => {
  assert.equal(getLiveViewerCountAccessibilityLabel(27), '27 viewers in the live');
});

test('describes a single live profile view', () => {
  assert.equal(getLiveProfileViewsAccessibilityLabel(1), '1 profile view in this live');
});

test('describes multiple live profile views', () => {
  assert.equal(getLiveProfileViewsAccessibilityLabel(14), '14 profile views in this live');
});
