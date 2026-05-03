import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveClerkPublishableKey, resolveClerkQaSignInTicket } from './clerkConfig';

test('prefers EXPO_PUBLIC clerk publishable key when present', () => {
  const resolved = resolveClerkPublishableKey({
    env: {
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_next',
    },
  });

  assert.equal(resolved, 'pk_test_expo');
});

test('falls back to NEXT_PUBLIC clerk publishable key when expo key is missing', () => {
  const resolved = resolveClerkPublishableKey({
    env: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_next_only',
    },
  });

  assert.equal(resolved, 'pk_test_next_only');
});

test('falls back to expo extra clerk publishable key when env is missing', () => {
  const resolved = resolveClerkPublishableKey({
    env: {},
    expoExtra: {
      clerkPublishableKey: 'pk_test_extra',
    },
  });

  assert.equal(resolved, 'pk_test_extra');
});

test('returns empty string when no clerk publishable key is configured', () => {
  const resolved = resolveClerkPublishableKey({ env: {} });

  assert.equal(resolved, '');
});

test('prefers EXPO_PUBLIC QA sign-in ticket when present', () => {
  const resolved = resolveClerkQaSignInTicket({
    env: {
      QA_CLERK_SIGN_IN_TICKET: 'ticket_private',
      EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET: 'ticket_env',
    },
    expoExtra: {
      clerkQaSignInTicket: 'ticket_extra',
    },
  });

  assert.equal(resolved, 'ticket_private');
});

test('falls back to EXPO_PUBLIC QA sign-in ticket when private env is missing', () => {
  const resolved = resolveClerkQaSignInTicket({
    env: {
      EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET: 'ticket_env',
    },
    expoExtra: {
      clerkQaSignInTicket: 'ticket_extra',
    },
  });

  assert.equal(resolved, 'ticket_env');
});

test('falls back to expo extra QA sign-in ticket when env is missing', () => {
  const resolved = resolveClerkQaSignInTicket({
    env: {},
    expoExtra: {
      clerkQaSignInTicket: 'ticket_extra',
    },
  });

  assert.equal(resolved, 'ticket_extra');
});

test('falls back to runtime query ticket when env and expo extra are missing', () => {
  const resolved = resolveClerkQaSignInTicket({
    env: {},
    runtimeSearch: '?qa_clerk_ticket=ticket_query',
  });

  assert.equal(resolved, 'ticket_query');
});

test('falls back to runtime storage ticket when query is missing', () => {
  const resolved = resolveClerkQaSignInTicket({
    env: {},
    runtimeStorageValue: 'ticket_storage',
  });

  assert.equal(resolved, 'ticket_storage');
});
