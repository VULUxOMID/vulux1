import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlaceholderValue,
  pickBaseUrl,
  readRequiredEnv,
} from './authenticated-web-smoke-helpers.mjs';

test('isPlaceholderValue flags known placeholder patterns', () => {
  assert.equal(isPlaceholderValue('your_publishable_key'), true);
  assert.equal(isPlaceholderValue('https://issuer.example.com'), true);
  assert.equal(isPlaceholderValue('pk_test_123'), false);
});

test('pickBaseUrl uses the local default when QA_BASE_URL is unset', () => {
  assert.equal(pickBaseUrl({}), 'http://127.0.0.1:19081');
});

test('pickBaseUrl normalizes explicit values', () => {
  assert.equal(pickBaseUrl({ QA_BASE_URL: 'http://localhost:8081/' }), 'http://localhost:8081');
});

test('pickBaseUrl rejects malformed values', () => {
  assert.throws(
    () => pickBaseUrl({ QA_BASE_URL: 'localhost:8081' }),
    /Invalid QA_BASE_URL/,
  );
});

test('readRequiredEnv rejects missing or placeholder values', () => {
  assert.throws(() => readRequiredEnv({}, 'CLERK_SECRET_KEY'), /Missing required env/);
  assert.throws(
    () => readRequiredEnv({ CLERK_SECRET_KEY: 'your_secret_here' }, 'CLERK_SECRET_KEY'),
    /placeholder value is not allowed/,
  );
});

test('readRequiredEnv returns trimmed values', () => {
  assert.equal(
    readRequiredEnv({ EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: ' pk_live_123 ' }, 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    'pk_live_123',
  );
});
