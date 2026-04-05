// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blurDocumentActiveElement,
  hasScreenOrientationApiSupport,
  isIgnorableOrientationError,
} from './webRuntimeCompat.shared';

test('isIgnorableOrientationError treats known web orientation failures as safe to ignore', () => {
  assert.equal(isIgnorableOrientationError(new DOMException('The request is not supported.', 'NotSupportedError')), true);
  assert.equal(isIgnorableOrientationError(new DOMException('The operation was aborted.', 'AbortError')), true);
  assert.equal(isIgnorableOrientationError(new Error('Screen orientation is not supported on this device.')), true);
  assert.equal(isIgnorableOrientationError(new Error('Unexpected orientation crash')), false);
});

test('hasScreenOrientationApiSupport requires both lock and unlock functions', () => {
  assert.equal(hasScreenOrientationApiSupport(undefined), false);
  assert.equal(hasScreenOrientationApiSupport({ orientation: null }), false);
  assert.equal(hasScreenOrientationApiSupport({ orientation: { lock: () => undefined } }), false);
  assert.equal(
    hasScreenOrientationApiSupport({
      orientation: {
        lock: () => Promise.resolve(),
        unlock: () => undefined,
      },
    }),
    true,
  );
});

test('blurDocumentActiveElement blurs the current active element when available', () => {
  let blurCalls = 0;
  blurDocumentActiveElement({
    activeElement: {
      blur() {
        blurCalls += 1;
      },
    },
  });

  assert.equal(blurCalls, 1);
});

test('blurDocumentActiveElement is safe when there is no active element or blur method', () => {
  assert.doesNotThrow(() => blurDocumentActiveElement(undefined));
  assert.doesNotThrow(() => blurDocumentActiveElement({ activeElement: null }));
  assert.doesNotThrow(() => blurDocumentActiveElement({ activeElement: {} }));
});
