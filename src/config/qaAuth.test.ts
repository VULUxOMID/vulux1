import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isQaGuestAuthEnabled,
  isQaGuestAuthSafeHost,
  requestQaGuestSession,
} from './qaAuth';

const originalEnv = {
  helperUrl: process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL,
  railwayApiBaseUrl: process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL,
  enabled: process.env.EXPO_PUBLIC_QA_GUEST_AUTH_ENABLE,
};
const originalFetch = globalThis.fetch;
const originalDev = (globalThis as Record<string, unknown>).__DEV__;

function setDev(value: boolean) {
  (globalThis as Record<string, unknown>).__DEV__ = value;
}

test.afterEach(() => {
  process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL = originalEnv.helperUrl;
  process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL = originalEnv.railwayApiBaseUrl;
  process.env.EXPO_PUBLIC_QA_GUEST_AUTH_ENABLE = originalEnv.enabled;
  globalThis.fetch = originalFetch;
  (globalThis as Record<string, unknown>).__DEV__ = originalDev;
});

test('isQaGuestAuthSafeHost accepts only local development hosts', () => {
  assert.equal(isQaGuestAuthSafeHost('http://127.0.0.1:3000'), true);
  assert.equal(isQaGuestAuthSafeHost('http://192.168.1.20:8787'), true);
  assert.equal(isQaGuestAuthSafeHost('https://qa-guest.vulu.local'), true);
  assert.equal(isQaGuestAuthSafeHost('https://example.com'), false);
});

test('isQaGuestAuthEnabled requires dev mode and a safe helper url', () => {
  setDev(true);
  process.env.EXPO_PUBLIC_QA_GUEST_AUTH_ENABLE = '1';
  process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL = 'https://example.com';
  assert.equal(isQaGuestAuthEnabled(), false);

  process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL = 'http://127.0.0.1:3000';
  assert.equal(isQaGuestAuthEnabled(), true);

  setDev(false);
  assert.equal(isQaGuestAuthEnabled(), false);
});

test('requestQaGuestSession rejects malformed helper responses missing issuer or subject', async () => {
  setDev(true);
  process.env.EXPO_PUBLIC_QA_GUEST_AUTH_ENABLE = '1';
  process.env.EXPO_PUBLIC_QA_AUTH_HELPER_URL = 'http://127.0.0.1:3000';
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        token: 'qa-token',
      }),
    } as Response);

  await assert.rejects(
    requestQaGuestSession('viewer-a'),
    /invalid session payload/i,
  );
});
