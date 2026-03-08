import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasGeneratedFontRule,
  isFontTimeoutError,
  readRequestedFontFamilies,
} from './expoFontTimeoutCompat.helpers';

test('readRequestedFontFamilies extracts a single family name', () => {
  assert.deepEqual(readRequestedFontFamilies('ionicons'), ['ionicons']);
});

test('readRequestedFontFamilies extracts mapped family names', () => {
  assert.deepEqual(
    readRequestedFontFamilies({
      ionicons: { uri: 'font.ttf' },
      Feather: { uri: 'feather.ttf' },
    }),
    ['ionicons', 'Feather'],
  );
});

test('isFontTimeoutError matches expo-font observer timeouts', () => {
  assert.equal(isFontTimeoutError(new Error('6000ms timeout exceeded')), true);
  assert.equal(isFontTimeoutError(new Error('A network error occurred.')), false);
});

test('hasGeneratedFontRule detects injected expo font-face css', () => {
  assert.equal(
    hasGeneratedFontRule('ionicons', () => ({
      textContent: '@font-face{font-family:"ionicons";src:url("/assets/Ionicons.ttf")}',
    })),
    true,
  );
});
