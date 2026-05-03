import assert from 'node:assert/strict';
import test from 'node:test';

import { getBackendTokenTemplate } from './backendToken';

const originalClerkTokenTemplate = process.env.EXPO_PUBLIC_CLERK_TOKEN_TEMPLATE;
const originalClerkBackendTokenTemplate = process.env.EXPO_PUBLIC_CLERK_BACKEND_TOKEN_TEMPLATE;

test.afterEach(() => {
  if (typeof originalClerkTokenTemplate === 'string') {
    process.env.EXPO_PUBLIC_CLERK_TOKEN_TEMPLATE = originalClerkTokenTemplate;
  } else {
    delete process.env.EXPO_PUBLIC_CLERK_TOKEN_TEMPLATE;
  }

  if (typeof originalClerkBackendTokenTemplate === 'string') {
    process.env.EXPO_PUBLIC_CLERK_BACKEND_TOKEN_TEMPLATE = originalClerkBackendTokenTemplate;
  } else {
    delete process.env.EXPO_PUBLIC_CLERK_BACKEND_TOKEN_TEMPLATE;
  }
});

test('getBackendTokenTemplate falls back to the backend Clerk template env name', () => {
  delete process.env.EXPO_PUBLIC_CLERK_TOKEN_TEMPLATE;
  process.env.EXPO_PUBLIC_CLERK_BACKEND_TOKEN_TEMPLATE = 'backend-template';

  assert.equal(getBackendTokenTemplate(), 'backend-template');
});

test('getBackendTokenTemplate prefers the app Clerk template env name when both are set', () => {
  process.env.EXPO_PUBLIC_CLERK_TOKEN_TEMPLATE = 'current-template';
  process.env.EXPO_PUBLIC_CLERK_BACKEND_TOKEN_TEMPLATE = 'backend-template';

  assert.equal(getBackendTokenTemplate(), 'current-template');
});
